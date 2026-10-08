import fs from 'fs-extra';
import path from 'path';
import { log, logerror } from "@/lib/logger";
import { upTrashDB } from '@/lib/service/up-trash-db';
import { prisma } from '@/lib/db';
import { cleanTrashItemsByUserId } from '@/lib/utils/trash/trash-clean';
import { AuthorizedPath, getUserTrashDir } from '@/lib/security/path-guard';

type TrashTarget = { physicalPath: string; itemName: string | null };

// Permanently removes one item from the user's own trash folder
export async function deleteFromTrashAction(userId: string, target: TrashTarget, confirm: boolean = false) {
    if (!target.itemName) {
        return { success: false, error: "Invalid trash item" };
    }

    if (!confirm) {
        return { success: false, error: "Require Confirm" };
    }

    try {
        await fs.remove(target.physicalPath);

        const parts = target.itemName.split('_id');
        const trashRecordId = parts.length > 1 ? parts.pop() : null;

        if (trashRecordId) {
            try {
                await prisma.trashShedule.delete({
                    where: { id: trashRecordId, userId }
                });
                log("Permanently deleted trash record id: " + trashRecordId);
            } catch (dbError) {
                logerror("Warning: DB record deletion failed or not found for id " + trashRecordId, dbError);
            }
        }

        return { success: true, message: "File permanently deleted" };

    } catch (error) {
        logerror("[Permanent Delete Failed]:", error);
        return { success: false, error: "Failed to permanently delete file" };
    }
}

// Permanently removes everything in the user's own trash folder. The folder comes
// from the user id only, never from the request, so no other path can be reached.
export async function emptyTrashAction(userId: string, confirm: boolean = false) {
    if (!confirm) {
        return { success: false, error: "Require Confirm" };
    }

    const trashFolder = getUserTrashDir(userId);
    const names = await fs.readdir(trashFolder).catch(() => [] as string[]);

    let removed = 0;
    const failed: string[] = [];

    for (const name of names) {
        try {
            // fs.remove unlinks a symlink instead of following it
            await fs.remove(path.join(trashFolder, name));
            removed++;
        } catch (error) {
            logerror("[Empty Trash] failed to remove " + name, error);
            failed.push(name);
        }
    }

    // Keep records whose files could not be removed, so they still show and can be retried
    const records = await prisma.trashShedule.findMany({ where: { userId } });
    const keep = new Set(failed);
    const forget = records.filter((r) => !keep.has(`${r.item}_id${r.id}`)).map((r) => r.id);
    if (forget.length > 0) {
        await prisma.trashShedule.deleteMany({ where: { id: { in: forget }, userId } });
    }

    if (failed.length > 0) {
        return { success: false, error: `${failed.length} item(s) could not be deleted`, removed };
    }

    return { success: true, message: "Trash emptied", removed };
}

export async function moveToTrashAction(userId: string, source: AuthorizedPath) {
    const name = path.basename(source.physicalPath);
    if (!name) return { success: false, error: "Invalid filename" };

    let trashRecordId: string | undefined | null = null;
    await cleanTrashItemsByUserId(userId)

    try {
        const { id } = await upTrashDB(userId, name, source.physicalPath, source.virtualPath);
        trashRecordId = id;

        if (!trashRecordId) {
            return { success: false, error: "Failed to delete file" };
        }

        const trashFolder = getUserTrashDir(userId);
        await fs.ensureDir(trashFolder);

        await fs.move(source.physicalPath, path.join(trashFolder, `${name}_id${id}`));

        return { message: "File or folder deleted", deletedPath: source.virtualPath };

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

        return { success: false, error: "Failed to delete file" };
    }
}
