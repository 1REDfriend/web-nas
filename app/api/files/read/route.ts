import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { ENV } from "@/lib/ENV";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqFile = searchParams.get('file');
    const reqOption = searchParams.get('option')

    if (!reqFile) {
        return NextResponse.json(
            { error: "File path is required" },
            { status: 400 }
        );
    }

    const physicalPath = path.join(ENV.STORAGE_ROOT, reqFile)
    const resolveRootPath = path.resolve(ENV.STORAGE_ROOT)
    const resolvePhysicalPath = path.resolve(physicalPath)

    try {

        if (!resolvePhysicalPath.startsWith(resolveRootPath)) {
            logerror(`[Access Denied] Attempt to access: ${physicalPath}`);
            return NextResponse.json(
                { error: "Access Denied" },
                { status: 403 }
            );
        }

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

        const content = await fs.readFile(physicalPath, "utf-8");
        if (reqOption == "preview") {
            const lines = content.split('\n').slice(0, 16);
            const limitedContent = lines.join('\n');

            return NextResponse.json({
            file: reqFile,
            size: stat.size,
            content: limitedContent
        });
        }

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