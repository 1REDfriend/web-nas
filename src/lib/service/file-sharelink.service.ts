import { readdir } from "fs-extra";
import { getFileStats } from "../utils/fs-helper";
import { FileItem } from "@/components/file-manager/config";

interface ShareLinkFile {
    physicalPath: string,
    recursive: boolean,
}

export async function getShareLinkFile({
    physicalPath,
    recursive,
}: ShareLinkFile) {

    const files = await readdir(physicalPath);

    const totalFiles = files.length;
    let resultFiles = [];

    const allFilesWithStats = await Promise.all(
        files.map(async (file) => {
            return await getFileStats(physicalPath, file, "")
        })
    );

    const validFiles = allFilesWithStats.filter((f): f is FileItem => f !== null);

    resultFiles = validFiles

    if (!recursive) {
        resultFiles.filter(f => f.type !== "directory");
    }

    return {
        data: resultFiles.filter(Boolean),
        totalFiles
    };
}