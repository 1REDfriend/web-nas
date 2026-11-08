import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { FileAccessError, fileAccessErrorResponse } from "@/lib/security/path-guard";

// Shared by the /api/public/pin routes

export function noStore(body: unknown, init: ResponseInit = {}, setCookie?: string | null): NextResponse {
    const response = NextResponse.json(body, init);
    response.headers.set("Cache-Control", "no-store");
    if (setCookie) response.headers.append("Set-Cookie", setCookie);
    return response;
}

export function pinErrorResponse(err: unknown, what: string): Response {
    const response = fileAccessErrorResponse(err);
    if (response) {
        if (response.status === 429) response.headers.set("Retry-After", "600");
        return response;
    }
    logerror(`[PIN] ${what} failed:`, err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
}

// Every state-changing call sends JSON. A plain form on another site cannot, so it
// cannot make a visitor's browser join or make a room behind their back.
export function assertJson(request: Request) {
    const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (type !== "application/json") throw new FileAccessError("Send the body as application/json", 415);
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
    assertJson(request);
    const body = await request.json().catch(() => null);
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}
