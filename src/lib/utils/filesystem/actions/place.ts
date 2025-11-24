import fs from 'fs-extra';

export async function placeAction(safeFilePath: string, type: string, content: string) {
    if (type !== "file" && type !== "folder") {
        throw new Error("Invalid 'place' type. Must be 'file' or 'folder'.");
    }

    if (type === "folder") {
        await fs.ensureDir(safeFilePath);
        return { message: "Folder created", newPath: safeFilePath };
    } else {
        await fs.outputFile(safeFilePath, content || "");
        return { message: "File created", newPath: safeFilePath };
    }
}