import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { mediaTypeOf } from "@/lib/file-manager/media";
import { createMediaResponse } from "@/lib/routes/filesystem/media-response";
import { authorizePath, fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";

// Streams an image, video or audio file so the browser can show it inline.
// Only types in MEDIA_TYPES are served (see media.ts).
export async function GET(request: Request) {
    const reqFile = new URL(request.url).searchParams.get("file");

    const user = await getRequestUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!reqFile) {
        return NextResponse.json({ error: "File path is required" }, { status: 400 });
    }

    if (!mediaTypeOf(reqFile)) {
        return NextResponse.json({ error: "This file type cannot be previewed. Download it instead." }, { status: 415 });
    }

    try {
        // Showing a file hands over its whole content, so it needs the same right as a download
        const { physicalPath } = await authorizePath(user, reqFile, "DOWNLOAD");
        return await createMediaResponse(request, physicalPath);
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[Raw File Failed] : " + err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
