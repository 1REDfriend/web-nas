import fs from 'fs-extra';
import path from 'path';
import { getSafePath } from '../utils';

export async function copyAction(safeFilePath: string, destination: string) {
    if (!destination) {
        throw new Error("No destination specified");
    }

    const safeDestFolder = getSafePath(destination);
    const finalDestPath = path.join(safeDestFolder, path.basename(safeFilePath));

    await fs.copy(safeFilePath, finalDestPath, { overwrite: false });
    return { message: "File copied", newPath: finalDestPath };
}