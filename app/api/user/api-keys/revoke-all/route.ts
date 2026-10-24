import { NextResponse } from "next/server";
import { log, logerror } from "@/lib/logger";
import { requireKeyManager } from "@/lib/api/user/api-key-access";
import { revokeAllApiKeys } from "@/lib/security/api-key";

// POST /api/user/api-keys/revoke-all: revokes every key the caller still has active
export async function POST() {
    const access = await requireKeyManager();
    if ("response" in access) return access.response;

    try {
        const count = await revokeAllApiKeys(access.user.id);
        log(`[API KEY] revoked all (${count}) for user ${access.user.id}`);
        return NextResponse.json({ success: true, revoked: count });
    } catch (err: unknown) {
        logerror("[API key revoke-all failed] : " + err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
