import fs from 'fs-extra';
import { log } from "@/lib/logger";

export async function deleteAction(safeFilePath: string) {
    log("LOG : " + safeFilePath);
    await fs.remove(safeFilePath);
    return { message: "File or folder deleted", deletedPath: safeFilePath };
}