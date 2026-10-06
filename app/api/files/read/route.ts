import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { authorizePath, fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { allowedExtensions } from "@/lib/routes/filesystem/allowedcExtensions";
import { recordRecent } from "@/lib/service/tracked-paths";

// Only the start of a file is read for a preview, however large the file is
const PREVIEW_BYTES = 64 * 1024;
const PREVIEW_LINES = 16;
const PREVIEW_CHARS = 1000;
// Full text reads are returned as JSON, so they are capped
const MAX_READ_BYTES = 10 * 1024 * 1024;

async function readHead(filePath: string, bytes: number): Promise<Buffer> {
    const handle = await fs.promises.open(filePath, "r");
    try {
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqFile = searchParams.get('file');
    const reqOption = searchParams.get('option')
    const isPreview = reqOption === "preview";

    const user = await getRequestUser()
    if (!user) {
        return NextResponse.json(
            { error: "Unauthurization" },
            { status: 401 }
        )
    }

    if (!reqFile) {
        return NextResponse.json(
            { error: "File path is required" },
            { status: 400 }
        );
    }

    if (isPreview && allowedExtensions.includes(path.extname(reqFile).toLowerCase())) {
        return NextResponse.json({ file: reqFile, size: null, content: null });
    }

    try {
        const { physicalPath, virtualPath } = await authorizePath(user, reqFile, isPreview ? "VIEW" : "DOWNLOAD");

        const exists = await fs.pathExists(physicalPath);
        if (!exists) {
            return NextResponse.json(
                { error: "File not found" },
                { status: 404 }
            );
        }

        const stat = await fs.stat(physicalPath);
        if (!stat.isFile()) {
            return NextResponse.json(
                { error: "Path is a directory, not a file" },
                { status: 400 }
            );
        }

        if (isPreview) {
            const head = await readHead(physicalPath, PREVIEW_BYTES);

            // A NUL byte almost always means a binary file; show no text for it
            if (head.includes(0)) {
                return NextResponse.json({ file: reqFile, size: stat.size, content: null });
            }

            const lines = head.toString("utf-8").split('\n').slice(0, PREVIEW_LINES);
            return NextResponse.json({
                file: reqFile,
                size: stat.size,
                content: lines.join('\n').slice(0, PREVIEW_CHARS)
            });
        }

        if (stat.size > MAX_READ_BYTES) {
            return NextResponse.json(
                { error: "File is too large to open as text. Download it instead." },
                { status: 413 }
            );
        }

        const content = await fs.readFile(physicalPath, "utf-8");
        await recordRecent(user.id, virtualPath, "opened");

        return NextResponse.json({
            file: reqFile,
            size: stat.size,
            content: content
        });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[Read File Failed] : " + err);
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        );
    }
}
