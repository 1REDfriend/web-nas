import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { logerror } from "@/lib/logger";
import { clearSessionCookie, revokeSession } from "@/lib/security/session";
import { NextResponse } from "next/server";

async function logout() {
    try {
        // proxy.ts only sets the payload for a valid session
        const payload = await xUserPayload();
        if (payload?.sid) {
            await revokeSession(payload.sid);
        }

        const response = NextResponse.json(
            { message : "Logout Successful"},
            { status : 200}
        );
        clearSessionCookie(response);

        return response;
    } catch (err : unknown) {
        logerror("[Logout Failed] : " + err)
        return NextResponse.json(
            { error : "Internal Error"},
            { status : 500}
        )
    }
}

export async function POST() {
    return logout();
}

export async function GET() {
    return logout();
}
