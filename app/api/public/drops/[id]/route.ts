import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { findPublicDrop, toPublicDrop } from "@/lib/drops/public";

// Public (no login): what the drop page shows. Opening it does not count as a download.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "list");
        const drop = await findPublicDrop((await params).id);
        return NextResponse.json({ drop: toPublicDrop(drop) }, { headers: { "Cache-Control": "no-store" } });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[public drop failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
