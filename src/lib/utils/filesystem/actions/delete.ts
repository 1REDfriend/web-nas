import fs from 'fs-extra';
import { log, logerror } from "@/lib/logger";
import { getInternalUserFolder } from '@/lib/folder/getInternalUserFolder';
import { upTrashDB } from '@/lib/service/up-trash-db';
import { prisma } from '@/lib/db';
import path from 'path';
import { cleanTrashItemsByUserId } from '../../trash/trash-clean';

export async function deleteAction(userId: string, safeFilePath: string) {
    log("LOG : " + safeFilePath);

    const name = path.basename(safeFilePath);
    if (!name) return { success: false, message: "Invalid filename" };

    let trashRecordId: string | undefined | null = null;
    await cleanTrashItemsByUserId(userId)

    try {
        const { id } = await upTrashDB(userId, name, safeFilePath);
        trashRecordId = id;

        if (!trashRecordId) {
            return { success: false, message: "Failed to delete file" };
        }

        const originalFileName = `${name}_id${id}`;
        const userFolder = await getInternalUserFolder(userId);
        const trashFolder = path.join(userFolder, "trash");

        await fs.ensureDir(trashFolder);

        await fs.move(safeFilePath, path.join(trashFolder, originalFileName));

        return { message: "File or folder deleted", deletedPath: safeFilePath };

    } catch (error) {
        logerror("[Delete Action Failed]:", error);

        if (trashRecordId) {
            try {
                await prisma.trashShedule.delete({ where: { id: trashRecordId } });
                log("Rollback: Deleted orphaned trash record id " + trashRecordId);
            } catch (rbError) {
                logerror("CRITICAL: Rollback failed for id " + trashRecordId, rbError);
            }
        }

        return { success: false, message: "Failed to delete file" };
    }
}