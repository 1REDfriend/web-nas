import fs from 'fs-extra';
import { AuthorizedPath } from '@/lib/security/path-guard';

export async function copyAction(source: AuthorizedPath, target: AuthorizedPath) {
    await fs.copy(source.physicalPath, target.physicalPath, { overwrite: false, errorOnExist: true });
    return { message: "File copied", newPath: target.virtualPath };
}
