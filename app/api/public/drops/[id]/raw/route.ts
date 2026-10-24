import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { createMediaResponse } from "@/lib/routes/filesystem/media-response";
import { FileAccessError, fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { dropFilePath } from "@/lib/drops/drops";
import { findPublicDrop, previewKind } from "@/lib/drops/public";

// Public (no login): shows an image, video or audio drop inline on its page.
// Not for drops with a download limit, which would otherwise be fetched uncounted.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "media");
        const drop = await findPublicDrop((await params).id);
        if (!previewKind(drop)) throw new FileAccessError("This drop cannot be previewed. Download it instead.", 415);

        return await createMediaResponse(request, dropFilePath(drop), drop.fileName);
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[public drop raw failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
