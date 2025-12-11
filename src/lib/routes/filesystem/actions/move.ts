import fs from 'fs-extra';
import path from 'path';
import { logerror } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { resolveUserPath } from '@/lib/utils/user/resolveUserPath';

export async function moveAction(userId: string, rawPath: string, destination: string) {
    if (!destination) {
        throw new Error("No destination specified");
    }

    const safeSrcFolder = await resolveUserPath(userId, rawPath);
    const safeDestFolder = await resolveUserPath(userId, destination);

    if (!safeDestFolder || !safeSrcFolder) {
        return { success: false, error: "Source file not found or Destination folder invalid" };
    }

    const fileName = path.basename(safeSrcFolder);
    const finalDestPath = path.join(safeDestFolder, fileName);

    const newRelativePath = path.join(destination, fileName).replace(/\\/g, '/');

    try {
        await fs.move(safeSrcFolder, finalDestPath, { overwrite: false });

        await prisma.starPath.updateMany({
            where: {
                userId: userId,
                rootPath: rawPath
            },
            data: {
                rootPath: newRelativePath 
            }
        });

        await prisma.shareLink.updateMany({
            where: {
                userId: userId,
                rootPath: rawPath
            },
            data: {
                rootPath: newRelativePath
            }
        });

        return { success: true, message: "File moved successfully", newPath: finalDestPath };

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logerror("Move Error:", msg);

        if (msg.includes("dest already exists")) {
            return { success: false, error: "Destination file already exists." };
        }
        if (msg.includes("subdirectory of itself")) {
            return { success: false, error: "Invalid move operation: Cannot move folder into itself." };
        }
        return { success: false, error: "Internal Server Error during file move" };
    }
}