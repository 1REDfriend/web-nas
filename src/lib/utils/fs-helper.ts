import path from 'path';
import { stat } from 'fs-extra';
import { FileItem } from '@/components/file-manager/config';

// ฟังก์ชันปรับ Path ให้เป็น format มาตรฐาน
export function normalizeFsPath(p: string): string {
    let pathStr = p.trim().replace(/\\/g, '/');

    if (/^[A-Za-z]:\//.test(pathStr)) {
        return pathStr;
    }

    if (!pathStr.startsWith('/')) {
        pathStr = '/' + pathStr;
    }

    return pathStr;
}

// ฟังก์ชันดึงข้อมูล Stat ของไฟล์เดียว
export async function getFileStats(physicalDirPath: string, fileName: string, virtualDirPath: string): Promise<FileItem | null> {
    try {
        const physicalFilePath = path.join(physicalDirPath, fileName);
        const stats = await stat(physicalFilePath);

        const isDir = stats.isDirectory();
        const ext = path.extname(fileName);
        const type = isDir ? 'directory' : ext.replace('.', '') || 'file';

        const virtualFilePath = path.join(virtualDirPath, fileName).replace(/\\/g, '/');

        return {
            id: virtualFilePath,
            name: fileName,
            path: virtualFilePath,
            type,
            size: isDir ? undefined : stats.size,
            updatedAt: stats.mtime.toISOString(),
            folder: virtualDirPath,
            isStarred: false,
        };
    } catch (err) {
        console.error(`[File Stat Error]: ${fileName}`, err);
        return null;
    }
}