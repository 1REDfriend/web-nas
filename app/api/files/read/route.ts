import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqFile = searchParams.get('file');

    if (!reqFile) {
        return NextResponse.json(
            { error: "File path is required" },
            { status: 400 }
        );
    }

    const BASE_DIR = process.cwd();

    try {
        const fullPath = path.resolve(BASE_DIR, reqFile);

        if (!fullPath.startsWith(BASE_DIR)) {
            logerror(`[Access Denied] Attempt to access: ${fullPath}`);
            return NextResponse.json(
                { error: "Access Denied" },
                { status: 403 }
            );
        }

        const exists = await fs.pathExists(fullPath);
        if (!exists) {
            return NextResponse.json(
                { error: "File not found" },
                { status: 404 }
            );
        }

        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) {
            return NextResponse.json(
                { error: "Path is a directory, not a file" },
                { status: 400 }
            );
        }

        const content = await fs.readFile(fullPath, "utf-8");

        return NextResponse.json({
            file: reqFile,
            size: stat.size,
            content: content
        });

    } catch (err: unknown) {
        logerror("[Read File Failed] : " + err);
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        );
    }
}