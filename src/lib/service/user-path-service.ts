import path from 'path';
import { prisma } from '@/lib/db';
import { normalizeFsPath } from '../utils/fs-helper';

export async function getUserRootPaths(userId: string) {
    const pathMaps = await prisma.pathMap.findMany({
        where: { userId: userId },
        select: {
            id: true,
            rootPath: true,
            description: true
        }
    });

    const starPaths = await prisma.starPath.findMany({
        where: { userId: userId },
        select: { rootPath: true }
    });

    const starredSet = new Set(starPaths.map((sp) => sp.rootPath));

    const userPathSet = new Set<string>();
    const duplicateIds: typeof pathMaps[number]['id'][] = [];
    const uniquePathMaps: typeof pathMaps = [];

    for (const p of pathMaps) {
        const normalizedRoot = normalizeFsPath(p.rootPath);
        if (userPathSet.has(normalizedRoot)) {
            duplicateIds.push(p.id);
        } else {
            userPathSet.add(normalizedRoot);
            uniquePathMaps.push(p);
        }
    }

    if (duplicateIds.length > 0) {
        await prisma.pathMap.deleteMany({
            where: { id: { in: duplicateIds } }
        });
    }

    return uniquePathMaps.map((p) => ({
        id: p.id,
        name: p.description ?? path.basename(p.rootPath),
        path: normalizeFsPath(p.rootPath),
        type: "directory",
        size: undefined,
        updatedAt: undefined,
        folder: null,
        isStarred: starredSet.has(p.rootPath),
    }));
}

export async function removeInvalidPathMap(reqPath: string) {
    await prisma.pathMap.deleteMany({
        where: { rootPath: reqPath }
    });
}