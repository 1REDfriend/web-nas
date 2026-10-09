import fs from "fs-extra";
import { randomBytes } from "crypto";
import { ShareLink } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getClientIp, recordAttempt, retryAfterSeconds } from "./rate-limit";
import {
    AuthorizedPath,
    FileAccessError,
    authorizePath,
    getAccessUser,
    joinVirtual,
    normalizeVirtualPath,
} from "./path-guard";

// Public share links are checked on every request, as the owner:
//   - the link must exist and not be expired
//   - the owner must still be allowed to SHARE the path (assigned folders and
//     protected-folder rules can change after the link was created)
//   - the requested sub path must stay inside the shared root
//   - non-recursive folder shares only expose the files directly inside

export type ResolvedShare = {
    share: ShareLink;
    root: AuthorizedPath;
    isDirectory: boolean;
};

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function createShareId(): string {
    return randomBytes(18).toString("base64url");
}

export function isShareExpired(share: Pick<ShareLink, "expireAt">, now = new Date()): boolean {
    return share.expireAt !== null && share.expireAt.getTime() <= now.getTime();
}

const UNAVAILABLE = "This share link is no longer available";

const RATE_WINDOW_MS = 5 * 60 * 1000;
// Media gets its own, larger buckets: seeking a video sends many Range requests,
// and a folder of photos asks for one thumbnail per picture
const RATE_LIMITS = { list: 300, download: 60, media: 600, thumb: 600 } as const;

// Public endpoints have no login, so every request counts against the caller's IP
export function assertShareRateLimit(request: Request, kind: keyof typeof RATE_LIMITS) {
    const rules = [{ key: `share-${kind}:${getClientIp(request)}`, limit: RATE_LIMITS[kind], windowMs: RATE_WINDOW_MS }];

    const wait = retryAfterSeconds(rules);
    if (wait > 0) {
        throw new FileAccessError(`Too many requests. Try again in ${Math.ceil(wait / 60)} minute(s).`, 429);
    }
    recordAttempt(rules);
}

export async function resolveShare(rawId: unknown): Promise<ResolvedShare> {
    if (typeof rawId !== "string" || !SHARE_ID_PATTERN.test(rawId)) {
        throw new FileAccessError("Share link not found", 404);
    }

    const share = await prisma.shareLink.findUnique({ where: { id: rawId } });
    if (!share) {
        throw new FileAccessError("Share link not found", 404);
    }

    if (isShareExpired(share)) {
        throw new FileAccessError("This share link has expired", 410);
    }

    const owner = await getAccessUser(share.userId);
    if (!owner) {
        throw new FileAccessError(UNAVAILABLE, 404);
    }

    let root: AuthorizedPath;
    try {
        root = await authorizePath(owner, share.rootPath, "SHARE", { includeSubtree: true });
    } catch (err: unknown) {
        // Do not tell anonymous visitors why the owner lost access
        if (err instanceof FileAccessError) throw new FileAccessError(UNAVAILABLE, 403);
        throw err;
    }

    const stats = await fs.stat(root.physicalPath).catch(() => null);
    if (!stats) {
        throw new FileAccessError(UNAVAILABLE, 404);
    }

    return { share, root, isDirectory: stats.isDirectory() };
}

// Resolves a path relative to the shared root ("/" is the root itself)
export async function resolveSharedEntry(resolved: ResolvedShare, rawSubPath: unknown): Promise<AuthorizedPath & { subPath: string }> {
    const subPath = normalizeVirtualPath(rawSubPath ?? "/");

    if (subPath === "/") {
        return { ...resolved.root, subPath };
    }

    if (!resolved.isDirectory) {
        throw new FileAccessError("Not found in this share", 404);
    }

    if (!resolved.share.recursive && subPath.split("/").length > 2) {
        throw new FileAccessError("Not found in this share", 404);
    }

    const rootVirtual = resolved.root.virtualPath;
    const targetVirtual = joinVirtual(rootVirtual, subPath);
    if (!targetVirtual.startsWith(rootVirtual === "/" ? "/" : rootVirtual + "/")) {
        throw new FileAccessError("Not found in this share", 404);
    }

    const owner = await getAccessUser(resolved.share.userId);
    if (!owner) {
        throw new FileAccessError(UNAVAILABLE, 404);
    }

    let target: AuthorizedPath;
    try {
        target = await authorizePath(owner, targetVirtual, "SHARE", { includeSubtree: true });
    } catch (err: unknown) {
        if (err instanceof FileAccessError) throw new FileAccessError("Not found in this share", 404);
        throw err;
    }

    const stats = await fs.stat(target.physicalPath).catch(() => null);
    if (!stats || (!resolved.share.recursive && stats.isDirectory())) {
        throw new FileAccessError("Not found in this share", 404);
    }

    return { ...target, subPath };
}
