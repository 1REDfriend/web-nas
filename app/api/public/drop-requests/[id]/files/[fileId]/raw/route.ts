import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { createMediaResponse } from "@/lib/routes/filesystem/media-response";
import { FileAccessError, fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { dropFilePath } from "@/lib/drops/drops";
import { startsDownload } from "@/lib/drops/public";
import { findPublicRequest, isUnlocked } from "@/lib/drops/request-public";
import { claimLinkDownload, findSharedFile } from "@/lib/drops/request-sharing";

// Public (no login): shows an image, video or audio file a drop request received,
// inline on the link's page. Same rules as the download; a fresh fetch of the whole
// file counts against the link's daily cap, so previews cannot dodge it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
    try {
        assertShareRateLimit(request, "media");
        const { id, fileId } = await params;
        const cookie = request.headers.get("cookie");
        const { request: link } = await findPublicRequest(id);
        if (!isUnlocked(link, cookie)) throw new FileAccessError("This link needs a password", 401);
        const drop = await findSharedFile(link, fileId, cookie);

        if (startsDownload(request.headers.get("range"))) await claimLinkDownload(link);
        const response = await createMediaResponse(request, dropFilePath(drop), drop.fileName);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[drop request file preview failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
