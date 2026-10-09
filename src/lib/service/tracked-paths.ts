import path from "path";
import fs from "fs-extra";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { FileItem } from "@/components/file-manager/config";
import { getFileStats } from "@/lib/utils/fs-helper";
import { AccessUser, authorizePath } from "@/lib/security/path-guard";

// Stars, share links and recent items all store virtual paths. This keeps them in
// step with the file system and turns them back into FileItems for the UI.

const RECENT_LIMIT = 50;

export type RecentAction = "opened" | "downloaded" | "uploaded" | "created" | "renamed" | "moved" | "copied" | "restored";

// Best effort: a failure here must never fail the file operation itself
export async function recordRecent(userId: string, virtualPath: string, action: RecentAction) {
    try {
        await prisma.recentItem.upsert({
            where: { idx_recent_user_path: { userId, path: virtualPath } },
            update: { action, usedAt: new Date() },
            create: { userId, path: virtualPath, action },
        });

        const stale = await prisma.recentItem.findMany({
            where: { userId },
            orderBy: { usedAt: "desc" },
            skip: RECENT_LIMIT,
            select: { id: true },
        });
        if (stale.length > 0) {
            await prisma.recentItem.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
        }
    } catch (err: unknown) {
        logerror("[recent record failed] :", err);
    }
}

function movedPath(current: string, from: string, to: string): string | null {
    if (current === from) return to;
    if (current.startsWith(from + "/")) return to + current.slice(from.length);
    return null;
}

// After a rename or move, points stars, share links and recent items at the new
// location, including everything that was inside a moved folder
export async function moveTrackedPaths(userId: string, from: string, to: string) {
    const match = { userId, OR: [{ rootPath: from }, { rootPath: { startsWith: from + "/" } }] };

    const stars = await prisma.starPath.findMany({ where: match });
    for (const star of stars) {
        const next = movedPath(star.rootPath, from, to);
        if (next) {
            await prisma.starPath.deleteMany({ where: { userId, rootPath: next } });
            await prisma.starPath.update({ where: { id: star.id }, data: { rootPath: next } });
        }
    }

    const shares = await prisma.shareLink.findMany({ where: match });
    for (const share of shares) {
        const next = movedPath(share.rootPath, from, to);
        if (next) await prisma.shareLink.update({ where: { id: share.id }, data: { rootPath: next } });
    }

    const recents = await prisma.recentItem.findMany({
        where: { userId, OR: [{ path: from }, { path: { startsWith: from + "/" } }] },
    });
    for (const recent of recents) {
        const next = movedPath(recent.path, from, to);
        if (next) {
            await prisma.recentItem.deleteMany({ where: { userId, path: next } });
            await prisma.recentItem.update({ where: { id: recent.id }, data: { path: next } });
        }
    }
}

export async function markStarred(userId: string, items: FileItem[]): Promise<FileItem[]> {
    if (items.length === 0) return items;

    const stars = await prisma.starPath.findMany({
        where: { userId, rootPath: { in: items.map((f) => f.path) } },
        select: { rootPath: true },
    });
    const starred = new Set(stars.map((s) => s.rootPath));
    return items.map((f) => ({ ...f, isStarred: starred.has(f.path) }));
}

// Skips paths the user can no longer see or that no longer exist
async function toFileItems(user: AccessUser, virtualPaths: string[]): Promise<FileItem[]> {
    const items = await Promise.all(virtualPaths.map(async (virtualPath) => {
        try {
            const target = await authorizePath(user, virtualPath, "VIEW");
            if (!(await fs.pathExists(target.physicalPath))) return null;

            return getFileStats(
                path.dirname(target.physicalPath),
                path.basename(target.physicalPath),
                path.posix.dirname(target.virtualPath)
            );
        } catch {
            return null;
        }
    }));

    return items.filter((f): f is FileItem => f !== null);
}

export async function listStarred(user: AccessUser): Promise<FileItem[]> {
    const stars = await prisma.starPath.findMany({
        where: { userId: user.id },
        orderBy: { rootPath: "asc" },
        select: { rootPath: true },
    });

    const items = await toFileItems(user, stars.map((s) => s.rootPath));
    return items.map((f) => ({ ...f, isStarred: true }));
}

export async function listRecent(user: AccessUser): Promise<FileItem[]> {
    const recents = await prisma.recentItem.findMany({
        where: { userId: user.id },
        orderBy: { usedAt: "desc" },
        select: { path: true },
    });

    return markStarred(user.id, await toFileItems(user, recents.map((r) => r.path)));
}
