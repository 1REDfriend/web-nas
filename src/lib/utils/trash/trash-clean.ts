import { prisma } from "@/lib/db";
import fs from 'fs-extra'
import { getUserTrashDir } from "@/lib/security/path-guard";
import path from "path";
import { logerror } from "@/lib/logger";

export async function cleanTrashItemsByUserId(userId: string) {
    const expired = await prisma.trashShedule.findMany({
        where: {
            userId: userId,
            expireDate: { lte: new Date() }
        }
    });

    if (expired.length > 0) {
        const trashFolder = getUserTrashDir(userId);
        const removedIds: string[] = [];

        await Promise.all(expired.map(async (item) => {
            const fullPath = path.join(trashFolder, path.basename(`${item.item}_id${item.id}`));

            try {
                await fs.remove(fullPath);
                removedIds.push(item.id);
            } catch (err) {
                logerror(`Failed to remove file: ${fullPath}`, err);
            }
        }));

        // Only forget items whose files are really gone, so a failed removal is retried
        if (removedIds.length > 0) {
            await prisma.trashShedule.deleteMany({
                where: { id: { in: removedIds } }
            });
        }
    }

    return await prisma.trashShedule.findMany({ where: { userId } });
}