import fs from 'fs-extra';
import { AuthorizedPath } from '@/lib/security/path-guard';

export async function placeAction(target: AuthorizedPath, type: string, content: string) {
    if (type !== "file" && type !== "folder") {
        throw new Error("Invalid 'place' type. Must be 'file' or 'folder'.");
    }

    if (await fs.pathExists(target.physicalPath)) {
        throw new Error("An item with that name already exists");
    }

    if (type === "folder") {
        await fs.ensureDir(target.physicalPath);
        return { message: "Folder created", newPath: target.virtualPath };
    } else {
        await fs.outputFile(target.physicalPath, content || "");
        return { message: "File created", newPath: target.virtualPath };
    }
}
