import { NextResponse } from "next/server";
import fs from "fs-extra";
import { Readable } from "stream";
import { logerror } from "@/lib/logger";
import { mediaTypeOf } from "@/lib/file-manager/media";
import { authorizePath, fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";

// Streams an image, video or audio file so the browser can show it inline.
// Supports Range requests so video and audio can seek without downloading
// everything first. Only types in MEDIA_TYPES are served (see media.ts).

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

function securityHeaders(headers: Headers) {
    // Belt and braces: even a mislabelled file cannot run script or be re-sniffed
    headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, max-age=300");
}

export async function GET(request: Request) {
    const reqFile = new URL(request.url).searchParams.get("file");

    const user = await getRequestUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!reqFile) {
        return NextResponse.json({ error: "File path is required" }, { status: 400 });
    }

    const media = mediaTypeOf(reqFile);
    if (!media) {
        return NextResponse.json({ error: "This file type cannot be previewed. Download it instead." }, { status: 415 });
    }

    try {
        // Showing a file hands over its whole content, so it needs the same right as a download
        const { physicalPath } = await authorizePath(user, reqFile, "DOWNLOAD");

        const stat = await fs.stat(physicalPath).catch(() => null);
        if (!stat || !stat.isFile()) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const headers = new Headers();
        headers.set("Content-Type", media.mime);
        headers.set("Content-Disposition", "inline");
        headers.set("Accept-Ranges", "bytes");
        securityHeaders(headers);

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
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[Raw File Failed] : " + err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
