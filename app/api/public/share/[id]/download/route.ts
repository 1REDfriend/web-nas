import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { createDownloadResponse } from "@/lib/routes/filesystem/download-response";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit, resolveShare, resolveSharedEntry } from "@/lib/security/share-access";

// Public (no login): downloads a file, or a folder as zip, from a share link.
// GET so the browser can stream it straight to disk via a normal link.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "download");
        const { id } = await params;
        const resolved = await resolveShare(id);
        const entry = await resolveSharedEntry(resolved, new URL(request.url).searchParams.get("path") ?? "/");

        return await createDownloadResponse(entry.physicalPath, {
            topLevelFilesOnly: !resolved.share.recursive,
        });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[public share download failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
