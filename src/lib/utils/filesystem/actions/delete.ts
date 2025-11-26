import fs from 'fs-extra';
import { log } from "@/lib/logger";
import { getInternalUserFolder } from '@/lib/folder/getInternalUserFolder';
import { upTrashDB } from '@/lib/service/up-trash-db';
import path from 'path';

export async function deleteAction( userId: string ,safeFilePath: string) {
    log("LOG : " + safeFilePath);

    const name = path.basename(safeFilePath)
    
    if (!name) return {success: false}
    
    const {id} = await upTrashDB(userId, name, safeFilePath)
    const originalFileName = name + "_id" + id
    const trashFolder = await getInternalUserFolder(userId) + "/trash";
    await fs.move(safeFilePath, path.join(trashFolder, originalFileName));
    return { message: "File or folder deleted", deletedPath: safeFilePath };    
}