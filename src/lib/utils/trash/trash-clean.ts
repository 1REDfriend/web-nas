import { prisma } from "@/lib/db";
import fs from 'fs-extra'
import { getInternalUserFolder } from "@/lib/folder/getInternalUserFolder";
import { pathReplaceValidate } from "@/lib/reosolvePath";
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
        const userFolder = await getInternalUserFolder(userId);
        const trashFolder = path.join(userFolder, "trash");
        let succ = false

        await Promise.all(expired.map(async (item) => {
            const itemName = `${item.item}_id${item.id}`;
            const itemPath = await pathReplaceValidate(itemName);

            const fullPath = path.join(trashFolder, itemPath);

            try {
                await fs.remove(fullPath);
                succ = true
            } catch (err) {
                logerror(`Failed to remove file: ${fullPath}`, err);
            }
        }));

        if (succ) {
            await prisma.trashShedule.deleteMany({
                where: {
                    id: {
                        in: expired.map(e => e.id)
                    }
                }
            });
        }
    }

    return await prisma.trashShedule.findMany({ where: { userId } });
}