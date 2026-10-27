import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { findPublicInbox, isUnlocked, toPublicInbox } from "@/lib/inbox/public";

// Public (no login): what the upload page shows. A locked link shows only its title.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "list");
        const { inbox } = await findPublicInbox((await params).id);
        const unlocked = isUnlocked(inbox, request.headers.get("cookie"));
        return NextResponse.json({ inbox: await toPublicInbox(inbox, unlocked) }, { headers: { "Cache-Control": "no-store" } });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[public inbox failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
