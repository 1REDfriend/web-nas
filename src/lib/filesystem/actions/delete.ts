import fs from 'fs-extra';
import { log, logerror } from "@/lib/logger";
import { getInternalUserFolder } from '@/lib/folder/getInternalUserFolder';
import { upTrashDB } from '@/lib/service/up-trash-db';
import { prisma } from '@/lib/db';
import path from 'path';
import { cleanTrashItemsByUserId } from '../../utils/trash/trash-clean';
import { pathReplaceValidate } from '@/lib/reosolvePath';

export async function deleteAction(userId: string, safeFilePath: string, rawPath: string, confirm: boolean = false) {
    log("LOG : " + safeFilePath);

    const name = path.basename(safeFilePath);
    if (!name) return { success: false, message: "Invalid filename" };

    const isTrashFile = rawPath.startsWith('/trash') || rawPath.startsWith('trash');

    if (isTrashFile) {
        if (!confirm) {
            return { success: false, error: "Require Confirm" };
        }

        try {
            await fs.remove(await getInternalUserFolder(userId) + await pathReplaceValidate(rawPath));

            const parts = name.split('_id');
            const trashRecordId = parts.length > 1 ? parts.pop() : null;

            if (trashRecordId) {
                try {
                    await prisma.trashShedule.delete({
                        where: { id: trashRecordId }
                    });
                    log("Permanently deleted trash record id: " + trashRecordId);
                } catch (dbError) {
                    logerror("Warning: DB record deletion failed or not found for id " + trashRecordId, dbError);
                }
            }

            return { success: true, message: "File permanently deleted" };

        } catch (error) {
            logerror("[Permanent Delete Failed]:", error);
            return { success: false, message: "Failed to permanently delete file" };
        }
    }

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