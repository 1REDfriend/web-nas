import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { ENV } from "@/lib/ENV";

// Where drops live on disk. Kept free of path-guard imports, because path-guard
// asks this module which folders to lock.

export const DROPS_FOLDER_KEY = "drops.folder";
// Marks a folder as one the app created for drops, so it may be reused later
export const DROPS_MARKER = ".webnas-drops";

// Same shape as share link ids: 18 random bytes, base64url
export const DROP_ID_RE = /^[A-Za-z0-9_-]{24}$/;

export function newDropId(): string {
    return randomBytes(18).toString("base64url");
}

export function defaultDropBase(): string {
    return path.resolve(ENV.DROPS_DEFAULT_DIR || path.join(ENV.STORAGE_INTERNAL, "drops"));
}

// Virtual path the admin picked, or null when the default is in use
export async function getDropFolderSetting(): Promise<string | null> {
    const row = await prisma.appSetting.findUnique({ where: { key: DROPS_FOLDER_KEY } });
    return row?.value || null;
}

export function dropBaseFor(folder: string | null): string {
    return folder ? path.join(path.resolve(ENV.STORAGE_ROOT), folder) : defaultDropBase();
}

// Folder new drops go to
export async function currentDropBase(): Promise<string> {
    return dropBaseFor(await getDropFolderSetting());
}

export function dropDir(baseDir: string, id: string): string {
    return path.join(baseDir, id);
}

export function dropFile(baseDir: string, id: string): string {
    return path.join(baseDir, id, "file");
}

const CACHE_MS = 5000;
let cached: { at: number; bases: string[] } | null = null;

// Every folder holding drops right now: the current one, plus old ones whose
// drops have not been moved out yet. path-guard locks all of them.
export async function getDropBases(): Promise<string[]> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.bases;

    const current = await currentDropBase();
    const rows = await prisma.drop.findMany({
        where: { deletedAt: null },
        distinct: ["baseDir"],
        select: { baseDir: true },
    });
    const bases = [...new Set([current, ...rows.map((r) => r.baseDir)])];

    cached = { at: Date.now(), bases };
    return bases;
}

export function invalidateDropBases() {
    cached = null;
}
