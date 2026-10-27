import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { findPublicInbox, toPublicInbox, unlockCookie, unlockInbox } from "@/lib/inbox/public";

// Public (no login): body { password }. Sets a cookie that opens this one link for a few hours.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { inbox } = await findPublicInbox((await params).id);
        const body = await request.json().catch(() => null);
        const { value, maxAge } = await unlockInbox(request, inbox, body?.password);

        const response = NextResponse.json({ inbox: await toPublicInbox(inbox, true) }, { headers: { "Cache-Control": "no-store" } });
        if (value) {
            const secure = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
            response.headers.append("Set-Cookie", unlockCookie(inbox, value, maxAge, secure));
        }
        return response;
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[inbox unlock failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
