import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { findPublicRequest, isUnlocked, toPublicRequest } from "@/lib/drops/request-public";

// Public (no login): what the request page shows. A locked link shows only its title.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "list");
        const found = await findPublicRequest((await params).id);
        const unlocked = isUnlocked(found.request, request.headers.get("cookie"));
        return NextResponse.json({ request: await toPublicRequest(found.request, unlocked) }, { headers: { "Cache-Control": "no-store" } });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[public drop request failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
