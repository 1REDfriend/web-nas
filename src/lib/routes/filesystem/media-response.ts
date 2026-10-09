import fs from "fs-extra";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { mediaTypeOf } from "@/lib/file-manager/media";
import { MAX_THUMB_SOURCE_BYTES, ThumbnailError, getThumbnail } from "@/lib/service/thumbnails";

// Shared by the logged-in routes (/api/files/raw, /thumb) and the share-link
// routes, so both apply exactly the same type allowlist and limits. Callers
// must authorize the path first.

type ByteRange = { start: number; end: number };

// Parses a single "bytes=" range. undefined = no/ignored header, null = unsatisfiable.
function parseRange(header: string | null, size: number): ByteRange | null | undefined {
    if (!header) return undefined;

    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    // Multiple ranges or another unit: serve the whole file instead
    if (!match || (!match[1] && !match[2])) return undefined;

    let start: number;
    let end: number;

    if (!match[1]) {
        // "bytes=-500" means the last 500 bytes
        const suffix = Number(match[2]);
        if (suffix === 0) return null;
        start = Math.max(size - suffix, 0);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }

    if (start >= size || start > end) return null;
    return { start, end };
}

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

// Streams an allowlisted image, video or audio file inline, with Range support
export async function createMediaResponse(request: Request, physicalPath: string): Promise<Response> {
    const media = mediaTypeOf(physicalPath);
    if (!media) {
        return jsonError("This file type cannot be previewed. Download it instead.", 415);
    }

    const stat = await fs.stat(physicalPath).catch(() => null);
    if (!stat || !stat.isFile()) {
        return jsonError("File not found", 404);
    }

    const headers = new Headers();
    headers.set("Content-Type", media.mime);
    headers.set("Content-Disposition", "inline");
    headers.set("Accept-Ranges", "bytes");
    // Belt and braces: even a mislabelled file cannot run script or be re-sniffed
    headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, max-age=300");

    const range = parseRange(request.headers.get("range"), stat.size);

    if (range === null) {
        headers.set("Content-Range", `bytes */${stat.size}`);
        return new Response(null, { status: 416, headers });
    }

    if (range) {
        headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
        headers.set("Content-Length", String(range.end - range.start + 1));
        const body = Readable.toWeb(fs.createReadStream(physicalPath, range)) as ReadableStream<Uint8Array>;
        return new Response(body, { status: 206, headers });
    }

    headers.set("Content-Length", String(stat.size));
    const body = Readable.toWeb(fs.createReadStream(physicalPath)) as ReadableStream<Uint8Array>;
    return new Response(body, { status: 200, headers });
}

// Serves a cached WebP thumbnail of an allowlisted image
export async function createThumbnailResponse(request: Request, physicalPath: string): Promise<Response> {
    if (mediaTypeOf(physicalPath)?.kind !== "image") {
        return jsonError("Thumbnails are only made for images", 415);
    }

    const stat = await fs.stat(physicalPath).catch(() => null);
    if (!stat || !stat.isFile()) {
        return jsonError("File not found", 404);
    }
    if (stat.size > MAX_THUMB_SOURCE_BYTES) {
        return jsonError("Image too large for a thumbnail", 413);
    }

    let thumb: { file: string; etag: string };
    try {
        thumb = await getThumbnail(physicalPath, stat);
    } catch (err: unknown) {
        // Unsupported or broken image: the grid falls back to an icon
        if (err instanceof ThumbnailError) return jsonError("Cannot make a thumbnail for this image", 422);
        throw err;
    }

    const headers = new Headers({
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        ETag: thumb.etag,
    });

    if (request.headers.get("if-none-match") === thumb.etag) {
        return new Response(null, { status: 304, headers });
    }

    const body = Readable.toWeb(fs.createReadStream(thumb.file)) as ReadableStream<Uint8Array>;
    return new Response(body, { status: 200, headers });
}
