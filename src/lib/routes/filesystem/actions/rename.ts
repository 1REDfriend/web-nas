import fs from 'fs-extra';
import { AuthorizedPath } from '@/lib/security/path-guard';
import { moveTrackedPaths, recordRecent } from '@/lib/service/tracked-paths';

export async function renameAction(userId: string, source: AuthorizedPath, target: AuthorizedPath) {
    // fs.rename silently replaces an existing file on POSIX
    if (await fs.pathExists(target.physicalPath)) {
        throw new Error("An item with that name already exists");
    }

    await fs.rename(source.physicalPath, target.physicalPath);
    await moveTrackedPaths(userId, source.virtualPath, target.virtualPath);
    await recordRecent(userId, target.virtualPath, "renamed");
    return { message: "File renamed", newPath: target.virtualPath };
}
