import { NextResponse } from "next/server";
import fs from "fs-extra";
import { Readable } from "stream";
import { logerror } from "@/lib/logger";
import { mediaTypeOf } from "@/lib/file-manager/media";
import { authorizePath, fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { MAX_THUMB_SOURCE_BYTES, ThumbnailError, getThumbnail } from "@/lib/service/thumbnails";

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

        const stat = await fs.stat(physicalPath).catch(() => null);
        if (!stat || !stat.isFile()) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }
        if (stat.size > MAX_THUMB_SOURCE_BYTES) {
            return NextResponse.json({ error: "Image too large for a thumbnail" }, { status: 413 });
        }

        const { file, etag } = await getThumbnail(physicalPath, stat);

        const headers = new Headers({
            "Content-Type": "image/webp",
            "Cache-Control": "private, max-age=86400",
            "X-Content-Type-Options": "nosniff",
            ETag: etag,
        });

        if (request.headers.get("if-none-match") === etag) {
            return new Response(null, { status: 304, headers });
        }

        const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>;
        return new Response(body, { status: 200, headers });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        if (err instanceof ThumbnailError) {
            // Unsupported or broken image: the grid falls back to an icon
            return NextResponse.json({ error: "Cannot make a thumbnail for this image" }, { status: 422 });
        }

        logerror("[Thumbnail Failed] : " + err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
