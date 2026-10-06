import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import fs from "fs-extra";
import { authorizePath, fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { allowedExtensions } from "@/lib/routes/filesystem/allowedcExtensions";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqFile = searchParams.get('file');
    const reqOption = searchParams.get('option')

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

    if (allowedExtensions.some(ext => reqFile.includes(ext)) && reqOption === "preview") {
        return NextResponse.json(
            { error: "Path is a Media File, not a simple file" }
        );
    }

    try {
        const { physicalPath } = await authorizePath(user, reqFile, reqOption === "preview" ? "VIEW" : "DOWNLOAD");

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
            const limitedContent = lines.join('\n').slice(0, 1000);

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
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[Read File Failed] : " + err);
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        );
    }
}