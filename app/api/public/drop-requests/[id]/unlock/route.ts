import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { findPublicRequest, toPublicRequest, unlockCookie, unlockRequest } from "@/lib/drops/request-public";

// Public (no login): body { password }. Sets a cookie that opens this one link for a few hours.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const found = await findPublicRequest((await params).id);
        const body = await request.json().catch(() => null);
        const { value, maxAge } = await unlockRequest(request, found.request, body?.password);

        const response = NextResponse.json({ request: await toPublicRequest(found.request, true) }, { headers: { "Cache-Control": "no-store" } });
        if (value) {
            const secure = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
            response.headers.append("Set-Cookie", unlockCookie(found.request, value, maxAge, secure));
        }
        return response;
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[drop request unlock failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
