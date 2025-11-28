import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';
import { getSafePath } from '../../filesystem/utils';
import { pathReplaceValidate } from '@/lib/reosolvePath';
import { ENV } from '@/lib/ENV';

export async function resolveUserPath(userId: string, rawPath: string): Promise<string | null> {
    const reqPath = await pathReplaceValidate(rawPath);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { pathMaps: true },
    });

    if (user && user.pathMaps.length > 0) {
        const matchedPathMap = user.pathMaps.find((pm) =>
            reqPath.startsWith(pm.rootPath)
        );

        if (matchedPathMap) {
            const safePath = getSafePath(matchedPathMap.rootPath);
            if (safePath && fs.existsSync(safePath)) {
                return safePath;
            }
        }
    }

    let selectedRoot = ENV.STORAGE_ROOT;
    let physicalPath = path.join(selectedRoot, reqPath);

    if (fs.existsSync(physicalPath)) {
        return physicalPath;
    }

    const userPrefix = `/${userId}`;
    let relativePath = reqPath;

    if (relativePath.startsWith(userPrefix)) {
        if (relativePath === userPrefix || relativePath === `${userPrefix}/`) {
            relativePath = "";
        } else {
            relativePath = relativePath.substring(userPrefix.length);
        }
    }

    selectedRoot = ENV.STORAGE_INTERNAL;
    physicalPath = path.join(selectedRoot, userId, relativePath);

    if (fs.existsSync(physicalPath)) {
        return physicalPath;
    }

    return null;
}