import fs from "fs-extra";
import type { Drop } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MediaKind, mediaTypeOf } from "@/lib/file-manager/media";
import { FileAccessError } from "@/lib/security/path-guard";
import { DROP_ID_RE } from "./locations";
import { dropFilePath, isDropAvailable } from "./drops";

// What people with a drop link (no login) may see and fetch.
//
// A drop with a download limit is only ever sent whole: no Range requests and no
// inline preview, because either would let someone fetch the file without it
// being counted. Drops without a limit can be resumed and previewed.

// Same answer for unknown, expired, used-up and removed drops: the link says nothing more
const GONE = "This link has expired or does not exist";

export async function findPublicDrop(rawId: unknown): Promise<Drop> {
    if (typeof rawId !== "string" || !DROP_ID_RE.test(rawId)) throw new FileAccessError(GONE, 404);

    const drop = await prisma.drop.findUnique({ where: { id: rawId } });
    if (!drop || !isDropAvailable(drop)) throw new FileAccessError(GONE, 404);

    const stat = await fs.stat(dropFilePath(drop)).catch(() => null);
    if (!stat?.isFile()) throw new FileAccessError(GONE, 404);
    return drop;
}

export function isLimited(drop: Drop): boolean {
    return drop.maxDownloads !== null;
}

export function previewKind(drop: Drop): MediaKind | null {
    return isLimited(drop) ? null : mediaTypeOf(drop.fileName)?.kind ?? null;
}

// Takes one download from a limited drop. False when another request took the last one first.
export async function claimDownload(drop: Drop): Promise<boolean> {
    if (drop.maxDownloads === null) {
        await prisma.drop.update({ where: { id: drop.id }, data: { downloads: { increment: 1 } } });
        return true;
    }
    const { count } = await prisma.drop.updateMany({
        where: { id: drop.id, deletedAt: null, expiresAt: { gt: new Date() }, downloads: { lt: drop.maxDownloads } },
        data: { downloads: { increment: 1 } },
    });
    return count === 1;
}

// A request for the whole file, or the start of it, counts as a download;
// later parts of a resumed download do not
export function startsDownload(rangeHeader: string | null): boolean {
    return rangeHeader === null || /^bytes=0-/i.test(rangeHeader.trim());
}

export function toPublicDrop(drop: Drop) {
    return {
        name: drop.fileName,
        size: String(drop.size),
        mimeType: drop.mimeType,
        expiresAt: drop.expiresAt,
        downloadsLeft: drop.maxDownloads === null ? null : Math.max(0, drop.maxDownloads - drop.downloads),
        preview: previewKind(drop),
    };
}
