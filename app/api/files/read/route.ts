import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { ENV } from "@/lib/ENV";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { allowedExtensions } from "@/lib/filesystem/allowedcExtensions";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqFile = searchParams.get('file');
    const reqOption = searchParams.get('option')

    const userPayload = await xUserPayload()
    if (!userPayload) {
        return NextResponse.json(
            { error: "Unauthurization" },
            { status: 401 }
        )
    }

    const userId = userPayload.sub

    if (!reqFile) {
        return NextResponse.json(
            { error: "File path is required" },
            { status: 400 }
        );
    }

    let physicalPath = path.join(ENV.STORAGE_ROOT, reqFile)
    let resolveRootPath = path.resolve(ENV.STORAGE_ROOT)
    let resolvePhysicalPath = path.resolve(physicalPath)

    if (!fs.existsSync(physicalPath)) {
        const selectedRoot = ENV.STORAGE_INTERNAL;
        physicalPath = path.join(selectedRoot, userId, reqFile);
        resolveRootPath = path.resolve(ENV.STORAGE_INTERNAL)
        resolvePhysicalPath = path.resolve(physicalPath)
    }

    if (allowedExtensions.some(ext => reqFile.includes(ext)) && reqOption === "preview") {
        return NextResponse.json(
            { error: "Path is a Media File, not a simple file" }
        );
    }

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