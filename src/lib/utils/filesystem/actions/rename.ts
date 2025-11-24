import fs from 'fs-extra';
import path from 'path';
import { ENV } from "@/lib/ENV";

export async function renameAction(safeFilePath: string, newName: string) {
    const rootWithSep = ENV.STORAGE_ROOT.endsWith(path.sep)
        ? ENV.STORAGE_ROOT
        : ENV.STORAGE_ROOT + path.sep;

    if (!newName || typeof newName !== 'string' || newName.includes('/') || newName.includes('..')) {
        throw new Error("Invalid new name");
    }

    const newSafePath = path.resolve(path.dirname(safeFilePath), newName);

    // ตรวจสอบว่า Path ปลายทางยังปลอดภัยอยู่
    if (!(newSafePath === ENV.STORAGE_ROOT || newSafePath.startsWith(rootWithSep))) {
        throw new Error("Invalid new path");
    }

    await fs.rename(safeFilePath, newSafePath);
    return { message: "File renamed", newPath: newSafePath };
}