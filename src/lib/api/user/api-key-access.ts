import { NextResponse } from "next/server";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { AccessUser, getAccessUser } from "@/lib/security/path-guard";
import { canUseApiKeys } from "@/lib/security/api-key";

// Key management (/api/user/api-keys) is for a logged-in browser only: an API key
// can never list, create or revoke keys. proxy.ts only sets API-key identities on
// /api/v1, so this is a second line of defence.
export async function requireKeyManager(): Promise<{ user: AccessUser } | { response: NextResponse }> {
    const payload = await xUserPayload();
    if (!payload || payload.via === "apikey") {
        return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    const user = await getAccessUser(payload.sub);
    if (!user) {
        return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    if (!canUseApiKeys(user.role)) {
        return { response: NextResponse.json({ error: "This account cannot use API keys." }, { status: 403 }) };
    }
    return { user };
}
