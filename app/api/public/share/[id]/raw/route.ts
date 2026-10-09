import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { createMediaResponse } from "@/lib/routes/filesystem/media-response";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit, resolveShare, resolveSharedEntry } from "@/lib/security/share-access";

// Public (no login): streams an image, video or audio file from a share link for
// inline viewing. Same share checks as the list and download routes.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "media");
        const { id } = await params;
        const resolved = await resolveShare(id);
        const entry = await resolveSharedEntry(resolved, new URL(request.url).searchParams.get("path") ?? "/");

        return await createMediaResponse(request, entry.physicalPath);
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[public share raw failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
