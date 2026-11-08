import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { createDownloadResponse } from "@/lib/routes/filesystem/download-response";
import { FileAccessError, fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { dropFilePath } from "@/lib/drops/drops";
import { startsDownload } from "@/lib/drops/public";
import { findPublicRequest, isUnlocked } from "@/lib/drops/request-public";
import { claimLinkDownload, findSharedFile } from "@/lib/drops/request-sharing";

// Public (no login): downloads one file a drop request received, when the link's
// share mode allows it ("own" or "all"). Counts against the link's daily cap and
// the drop's download count; later parts of a resumed download do not.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
    try {
        assertShareRateLimit(request, "download");
        const { id, fileId } = await params;
        const cookie = request.headers.get("cookie");
        const { request: link } = await findPublicRequest(id);
        if (!isUnlocked(link, cookie)) throw new FileAccessError("This link needs a password", 401);
        const drop = await findSharedFile(link, fileId, cookie);

        const range = request.headers.get("range");
        if (startsDownload(range)) {
            await claimLinkDownload(link);
            await prisma.drop.update({ where: { id: drop.id }, data: { downloads: { increment: 1 } } });
        }

        const response = await createDownloadResponse(dropFilePath(drop), { fileName: drop.fileName, rangeHeader: range });
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[drop request file download failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
