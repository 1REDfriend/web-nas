import path from "path";
import fs from "fs-extra";
import mime from "mime-types";
import type { Drop } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { FileAccessError, validateEntryName } from "@/lib/security/path-guard";
import { currentDropBase, dropDir, dropFile, newDropId } from "./locations";
import { ensureDropBase, runExclusive, sweepDrops } from "./maintenance";
import { getDropLimits } from "./settings";

// Creating, finding and removing drops. Callers decide who may do it.

export type DropOwner = { userId: string; keyId: string | null };
export type DropOptions = { name: string; lifetimeMs: number; maxDownloads: number | null };

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const UNIT_MS: Record<string, number> = { m: MINUTE_MS, h: HOUR_MS, d: 24 * HOUR_MS };
const MAX_DOWNLOADS = 1_000_000;
// An upload in progress keeps this placeholder expiry; its real lifetime starts when it finishes
const UPLOAD_GRACE_MS = 24 * HOUR_MS;

type RawDropOptions = { name?: string | null; expiresIn?: string | null; maxDownloads?: string | null };

function blank(value: string | null | undefined): value is null | undefined | "" {
    return value === null || value === undefined || value.trim() === "";
}

// "30m", "24h" or "7d"; empty = the admin's default lifetime
async function parseLifetime(raw: string | null | undefined): Promise<number> {
    const limits = await getDropLimits();
    if (blank(raw)) return limits.defaultHours * HOUR_MS;

    const match = /^(\d{1,6})([mhd])$/i.exec(raw.trim());
    if (!match) throw new FileAccessError('expiresIn must look like "30m", "24h" or "7d"', 400);

    const ms = Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
    if (ms < MINUTE_MS) throw new FileAccessError("expiresIn must be at least 1 minute", 400);
    if (ms > limits.maxHours * HOUR_MS) throw new FileAccessError(`expiresIn can be at most ${limits.maxHours}h`, 400);
    return ms;
}

function parseMaxDownloads(raw: string | null | undefined): number | null {
    if (blank(raw)) return null;
    const value = Number(raw.trim());
    if (!/^\d+$/.test(raw.trim()) || value < 1 || value > MAX_DOWNLOADS) {
        throw new FileAccessError(`maxDownloads must be a whole number from 1 to ${MAX_DOWNLOADS}`, 400);
    }
    return value;
}

// Only the last path segment of what the client sent is kept
function parseDropName(raw: string | null | undefined): string {
    const name = path.posix.basename((raw ?? "").replace(/\\/g, "/")) || "file";
    return validateEntryName(name);
}

export async function parseDropOptions(raw: RawDropOptions): Promise<DropOptions> {
    return {
        name: parseDropName(raw.name),
        lifetimeMs: await parseLifetime(raw.expiresIn),
        maxDownloads: parseMaxDownloads(raw.maxDownloads),
    };
}

// Bytes the user may still put in drops; Infinity when there is no quota
export async function remainingDropQuota(userId: string): Promise<number> {
    const { quotaMB } = await getDropLimits();
    if (quotaMB === 0) return Infinity;

    const used = await prisma.drop.aggregate({ where: { userId, deletedAt: null }, _sum: { size: true } });
    return Math.max(0, quotaMB * 1024 * 1024 - Number(used._sum.size ?? 0));
}

// Records the drop first, then makes its folder: the sweeper only removes folders no live row owns
export async function beginDrop(owner: DropOwner, name: string): Promise<Drop> {
    const baseDir = await currentDropBase();
    await ensureDropBase(baseDir);

    const drop = await prisma.drop.create({
        data: {
            id: newDropId(),
            fileName: name,
            baseDir,
            userId: owner.userId,
            keyId: owner.keyId,
            expiresAt: new Date(Date.now() + UPLOAD_GRACE_MS),
        },
    });
    await fs.ensureDir(dropDir(baseDir, drop.id));
    return drop;
}

export function dropFilePath(drop: Pick<Drop, "id" | "baseDir">): string {
    return dropFile(drop.baseDir, drop.id);
}

export function dropFolderPath(drop: Pick<Drop, "id" | "baseDir">): string {
    return dropDir(drop.baseDir, drop.id);
}

// The file is in place: the drop goes live and its lifetime starts now
export async function finishDrop(drop: Drop, options: DropOptions): Promise<Drop> {
    const size = (await fs.stat(dropFilePath(drop))).size;
    const now = new Date();

    return prisma.drop.update({
        where: { id: drop.id },
        data: {
            fileName: options.name,
            size: BigInt(size),
            mimeType: mime.lookup(options.name) || null,
            maxDownloads: options.maxDownloads,
            completedAt: now,
            expiresAt: new Date(now.getTime() + options.lifetimeMs),
        },
    });
}

// Undoes a failed upload completely
export async function abortDrop(drop: Drop) {
    await fs.remove(dropFolderPath(drop)).catch((err) => logerror(`[drops] could not clean up drop ${drop.id}:`, err));
    await prisma.drop.deleteMany({ where: { id: drop.id } });
}

export function isDropAvailable(drop: Drop, now = new Date()): boolean {
    return (
        drop.completedAt !== null &&
        drop.deletedAt === null &&
        drop.expiresAt.getTime() > now.getTime() &&
        (drop.maxDownloads === null || drop.downloads < drop.maxDownloads)
    );
}

// The user's drops that can still be downloaded, newest first
export async function listDrops(userId: string): Promise<Drop[]> {
    const now = new Date();
    const rows = await prisma.drop.findMany({
        where: { userId, deletedAt: null, completedAt: { not: null }, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
    });
    return rows.filter((drop) => isDropAvailable(drop, now));
}

export async function findDrop(userId: string, id: string): Promise<Drop | null> {
    const drop = await prisma.drop.findFirst({ where: { id, userId } });
    return drop && isDropAvailable(drop) ? drop : null;
}

// Expires the drop at once (its link stops working) and lets the sweeper delete the file
export async function removeDrop(userId: string, id: string): Promise<boolean> {
    const drop = await findDrop(userId, id);
    if (!drop) return false;

    await prisma.drop.update({ where: { id }, data: { expiresAt: new Date() } });
    runExclusive(() => sweepDrops()).catch((err) => logerror("[drops] sweep after delete failed:", err));
    return true;
}
