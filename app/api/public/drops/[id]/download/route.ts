import { NextResponse } from "next/server";
import mime from "mime-types";
import { logerror } from "@/lib/logger";
import { createDownloadResponse } from "@/lib/routes/filesystem/download-response";
import { FileAccessError, fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { dropFilePath } from "@/lib/drops/drops";
import { claimDownload, findPublicDrop, isLimited, startsDownload } from "@/lib/drops/public";

// Public (no login): downloads a drop. Each download is counted; a drop with a
// download limit is always sent whole (see src/lib/drops/public.ts).

function errorResponse(err: unknown) {
    const accessResponse = fileAccessErrorResponse(err);
    if (accessResponse) return accessResponse;

    logerror("[public drop download failed] :", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "download");
        const drop = await findPublicDrop((await params).id);
        const range = isLimited(drop) ? undefined : request.headers.get("range");

        if (range === undefined || startsDownload(range)) {
            if (!(await claimDownload(drop))) throw new FileAccessError("This link has expired or does not exist", 404);
        }

        const response = await createDownloadResponse(dropFilePath(drop), { fileName: drop.fileName, rangeHeader: range });
        // A cache in between must not hand a counted file to the next person
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (err: unknown) {
        return errorResponse(err);
    }
}

// Size and type without counting a download (curl -I, download managers)
export async function HEAD(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "list");
        const drop = await findPublicDrop((await params).id);
        return new Response(null, {
            headers: {
                "Content-Type": mime.lookup(drop.fileName) || "application/octet-stream",
                "Content-Length": String(drop.size),
                "Cache-Control": "private, no-store",
                ...(isLimited(drop) ? {} : { "Accept-Ranges": "bytes" }),
            },
        });
    } catch (err: unknown) {
        return errorResponse(err);
    }
}
