import fs from 'fs-extra';
import { AuthorizedPath } from '@/lib/security/path-guard';

export async function renameAction(source: AuthorizedPath, target: AuthorizedPath) {
    // fs.rename silently replaces an existing file on POSIX
    if (await fs.pathExists(target.physicalPath)) {
        throw new Error("An item with that name already exists");
    }

    await fs.rename(source.physicalPath, target.physicalPath);
    return { message: "File renamed", newPath: target.virtualPath };
}
