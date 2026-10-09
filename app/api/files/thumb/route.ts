import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { mediaTypeOf } from "@/lib/file-manager/media";
import { createThumbnailResponse } from "@/lib/routes/filesystem/media-response";
import { authorizePath, fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";

// Small cached WebP thumbnail of an image for the file grid
export async function GET(request: Request) {
    const reqFile = new URL(request.url).searchParams.get("file");

    const user = await getRequestUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!reqFile) {
        return NextResponse.json({ error: "File path is required" }, { status: 400 });
    }

    if (mediaTypeOf(reqFile)?.kind !== "image") {
        return NextResponse.json({ error: "Thumbnails are only made for images" }, { status: 415 });
    }

    try {
        // A thumbnail shows the image, so it needs the same right as opening it
        const { physicalPath } = await authorizePath(user, reqFile, "DOWNLOAD");
        return await createThumbnailResponse(request, physicalPath);
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[Thumbnail Failed] : " + err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
