import fs from 'fs-extra';
import { logerror } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { AuthorizedPath } from '@/lib/security/path-guard';

export async function moveAction(userId: string, source: AuthorizedPath, target: AuthorizedPath) {
    try {
        await fs.move(source.physicalPath, target.physicalPath, { overwrite: false });

        await prisma.starPath.updateMany({
            where: {
                userId: userId,
                rootPath: source.virtualPath
            },
            data: {
                rootPath: target.virtualPath
            }
        });

        await prisma.shareLink.updateMany({
            where: {
                userId: userId,
                rootPath: source.virtualPath
            },
            data: {
                rootPath: target.virtualPath
            }
        });

        return { success: true, message: "File moved successfully", newPath: target.virtualPath };

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
