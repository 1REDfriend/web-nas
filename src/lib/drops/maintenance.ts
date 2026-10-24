import path from "path";
import fs from "fs-extra";
import { prisma } from "@/lib/db";
import { ENV } from "@/lib/ENV";
import { logerror, logwarn } from "@/lib/logger";
import {
    DROPS_MARKER,
    DROP_ID_RE,
    currentDropBase,
    dropDir,
    invalidateDropBases,
} from "./locations";

// Background upkeep for drops: deleting expired ones and moving drops into the
// current drop folder. Everything here runs one job at a time.

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;   // an upload that never finished
const KEEP_DELETED_MS = 7 * 24 * 60 * 60 * 1000; // deleted rows stay this long for the owner's list
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;       // leave fresh folders alone; an upload may be creating one

let chain: Promise<unknown> = Promise.resolve();

export function runExclusive<T>(job: () => Promise<T>): Promise<T> {
    const next = chain.then(job, job);
    chain = next.catch(() => undefined);
    return next;
}

// Creates the folder and its marker so it can be recognised (and reused) later
export async function ensureDropBase(base: string) {
    await fs.ensureDir(base);
    const marker = path.join(base, DROPS_MARKER);
    if (!(await fs.pathExists(marker))) {
        await fs.writeFile(marker, "Temporary files from web-nas. Managed by the app; do not edit.\n");
    }
}

// Removes a drop folder that holds nothing but its marker. Never recursive.
async function removeBaseIfEmpty(base: string) {
    try {
        const entries = await fs.readdir(base);
        if (entries.some((name) => name !== DROPS_MARKER)) return;
        await fs.remove(path.join(base, DROPS_MARKER));
        await fs.rmdir(base);
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") logwarn(`[drops] could not remove old folder ${base}:`, err);
    }
}

async function removeDropFiles(drop: { id: string; baseDir: string }): Promise<boolean> {
    try {
        await fs.remove(dropDir(drop.baseDir, drop.id));
        return true;
    } catch (err) {
        logerror(`[drops] could not delete drop ${drop.id}:`, err);
        return false;
    }
}

export type MigrationState = { running: boolean; lastError: string | null };
const migration: MigrationState = { running: false, lastError: null };

export function getMigrationState(): MigrationState {
    return { ...migration };
}

// Moves every finished, live drop that is not in the current drop folder into it.
// Each row points at wherever its file really is, so links keep working while this runs.
async function moveDropsToCurrentBase(extraOldBases: string[] = []) {
    const base = await currentDropBase();
    const rows = await prisma.drop.findMany({
        where: { deletedAt: null, completedAt: { not: null }, baseDir: { not: base } },
        select: { id: true, baseDir: true },
    });
    if (rows.length === 0 && extraOldBases.length === 0) return;

    await ensureDropBase(base);
    let failed = 0;

    for (const row of rows) {
        const from = dropDir(row.baseDir, row.id);
        const to = dropDir(base, row.id);
        try {
            if (await fs.pathExists(from)) {
                // overwrite: a copy left half-done by an earlier attempt across disks
                await fs.move(from, to, { overwrite: true });
            } else if (!(await fs.pathExists(to))) {
                logwarn(`[drops] drop ${row.id} has no file in ${row.baseDir}; marking it deleted`);
                await prisma.drop.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
                continue;
            }
            await prisma.drop.update({ where: { id: row.id }, data: { baseDir: base } });
        } catch (err: unknown) {
            failed++;
            logerror(`[drops] could not move drop ${row.id} to ${base}:`, err);
            migration.lastError = err instanceof Error ? err.message : String(err);
        }
    }
    if (failed === 0) migration.lastError = null;

    invalidateDropBases();
    const stillUsed = new Set(
        (await prisma.drop.findMany({ where: { deletedAt: null }, distinct: ["baseDir"], select: { baseDir: true } }))
            .map((r) => r.baseDir)
    );
    for (const old of new Set([...rows.map((r) => r.baseDir), ...extraOldBases])) {
        if (old !== base && !stillUsed.has(old)) await removeBaseIfEmpty(old);
    }
}

// Starts moving drops after the drop folder changed; returns at once
export function startDropMigration(previousBase: string) {
    migration.running = true;
    runExclusive(() => moveDropsToCurrentBase([previousBase]))
        .catch((err) => {
            logerror("[drops] moving drops failed:", err);
            migration.lastError = err instanceof Error ? err.message : String(err);
        })
        .finally(() => {
            migration.running = false;
        });
}

// Deletes the files of expired, used-up and abandoned drops
async function deleteDeadDrops(now: Date) {
    const dead = await prisma.drop.findMany({
        where: {
            deletedAt: null,
            OR: [
                { expiresAt: { lte: now } },
                { completedAt: null, createdAt: { lte: new Date(now.getTime() - STALE_UPLOAD_MS) } },
            ],
        },
        select: { id: true, baseDir: true },
    });
    // Prisma cannot compare two columns, so used-up drops are picked out here
    const usedUp = await prisma.drop.findMany({
        where: { deletedAt: null, maxDownloads: { not: null } },
        select: { id: true, baseDir: true, downloads: true, maxDownloads: true },
    });
    const targets = [...dead, ...usedUp.filter((d) => d.downloads >= (d.maxDownloads ?? Infinity))];

    const removed: string[] = [];
    for (const drop of new Map(targets.map((d) => [d.id, d])).values()) {
        if (await removeDropFiles(drop)) removed.push(drop.id);
    }
    if (removed.length > 0) {
        await prisma.drop.updateMany({ where: { id: { in: removed } }, data: { deletedAt: now } });
        invalidateDropBases();
    }
}

// Folders in the drop folder that no live drop owns (e.g. a crash mid-upload)
async function deleteOrphanFolders(now: Date) {
    const base = await currentDropBase();
    let names: string[];
    try {
        names = (await fs.readdir(base)).filter((name) => DROP_ID_RE.test(name));
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
    }
    if (names.length === 0) return;

    const live = new Set(
        (await prisma.drop.findMany({ where: { id: { in: names }, deletedAt: null }, select: { id: true } })).map((r) => r.id)
    );
    for (const name of names) {
        if (live.has(name)) continue;
        const full = path.join(base, name);
        const stat = await fs.lstat(full).catch(() => null);
        if (!stat?.isDirectory() || now.getTime() - stat.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
        await fs.remove(full).catch((err) => logerror(`[drops] could not delete leftover folder ${full}:`, err));
    }
}

export async function sweepDrops(now = new Date()) {
    await deleteDeadDrops(now);
    await prisma.drop.deleteMany({ where: { deletedAt: { lte: new Date(now.getTime() - KEEP_DELETED_MS) } } });
    await moveDropsToCurrentBase();
    await deleteOrphanFolders(now);
}

const globalForSweeper = globalThis as unknown as { dropSweeper?: NodeJS.Timeout };

export function startDropSweeper() {
    if (globalForSweeper.dropSweeper) return;

    const tick = () => {
        runExclusive(() => sweepDrops()).catch((err) => logerror("[drops] sweep failed:", err));
    };
    globalForSweeper.dropSweeper = setInterval(tick, ENV.DROPS_SWEEP_SECONDS * 1000);
    globalForSweeper.dropSweeper.unref();
    tick();
}
