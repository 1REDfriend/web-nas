import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { createThumbnailResponse } from "@/lib/routes/filesystem/media-response";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit, resolveShare, resolveSharedEntry } from "@/lib/security/share-access";

// Public (no login): thumbnail of an image inside a share link
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "thumb");
        const { id } = await params;
        const resolved = await resolveShare(id);
        const entry = await resolveSharedEntry(resolved, new URL(request.url).searchParams.get("path") ?? "/");

        return await createThumbnailResponse(request, entry.physicalPath);
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[public share thumb failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
