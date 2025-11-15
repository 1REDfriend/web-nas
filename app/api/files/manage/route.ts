import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import fs from 'fs-extra';
import path from 'path';

const BASE_DIR = path.resolve(process.cwd(), 'user_files');

const getSafePath = (userPath: string): string => {
    const resolvedPath = path.resolve(path.join(BASE_DIR, userPath));

    if (!resolvedPath.startsWith(BASE_DIR)) {
        throw new Error("Invalid path: Access denied.");
    }

    return resolvedPath;
};

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqFile = searchParams.get('file');
    const reqOption = searchParams.get('option');
    const body = await request.json();

    try {
        if (!reqFile) {
            return NextResponse.json(
                { error: "No File Select" },
                { status: 400 }
            );
        }

        const safeFilePath = getSafePath(reqFile);

        if (reqOption == "rename") {
            const { newName } = await request.json();

            if (!newName || typeof newName !== 'string' || newName.includes('/') || newName.includes('..')) {
                return NextResponse.json(
                    { error: "Invalid new name" },
                    { status: 400 }
                );
            }

            const newSafePath = path.resolve(path.dirname(safeFilePath), newName);

            if (!newSafePath.startsWith(BASE_DIR)) {
                return NextResponse.json(
                    { error: "Invalid new path" },
                    { status: 403 }
                );
            }

            await fs.rename(safeFilePath, newSafePath);
            return NextResponse.json({ success: true, message: "File renamed", newPath: newSafePath });
        }

        if (reqOption == "moveTo" || reqOption == "cut") {
            const { destination } = body;
            if (!destination) {
                return NextResponse.json(
                    { error: "No destination specified" },
                    { status: 400 }
                );
            }

            const safeDestFolder = getSafePath(destination);
            const finalDestPath = path.join(safeDestFolder, path.basename(safeFilePath));

            await fs.move(safeFilePath, finalDestPath, { overwrite: false });
            return NextResponse.json(
                { success: true, message: "File moved", newPath: finalDestPath }
            );
        }

        if (reqOption == "copy") {
            const { destination } = await request.json();
            if (!destination) {
                return NextResponse.json(
                    { error: "No destination specified" },
                    { status: 400 }
                );
            }

            const safeDestFolder = getSafePath(destination);
            const finalDestPath = path.join(safeDestFolder, path.basename(safeFilePath));

            await fs.copy(safeFilePath, finalDestPath, { overwrite: false });
            return NextResponse.json(
                { success: true, message: "File copied", newPath: finalDestPath }
            );
        }

        if (reqOption == "place") {
            const { type, content } = await request.json();

            if (type === "folder") {
                await fs.ensureDir(safeFilePath);
                return NextResponse.json(
                    { success: true, message: "Folder created", newPath: safeFilePath }
                );
            }

            if (type === "file") {
                await fs.outputFile(safeFilePath, content || "");
                return NextResponse.json(
                    { success: true, message: "File created", newPath: safeFilePath }
                );
            }

            return NextResponse.json({ error: "Invalid 'place' type. Must be 'file' or 'folder'." }, { status: 400 });
        }

        if (reqOption == "delete") {
            await fs.remove(safeFilePath);
            return NextResponse.json({ success: true, message: "File or folder deleted", deletedPath: safeFilePath });
        }

        return NextResponse.json(
            { error: "Invalid operation specified" },
            { status: 400 }
        );
    } catch (err: unknown) {
        logerror("[Manage File Failed] : " + err);
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        );
    }
}