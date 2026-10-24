import { NextResponse } from "next/server";
import { log, logerror } from "@/lib/logger";
import { requireKeyManager } from "@/lib/api/user/api-key-access";
import { revokeApiKey } from "@/lib/security/api-key";

// DELETE /api/user/api-keys/<id>: revokes one of the caller's own keys.
// The row stays (shown as revoked) so its last use remains visible.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const access = await requireKeyManager();
    if ("response" in access) return access.response;

    try {
        const { id } = await params;
        const revoked = await revokeApiKey(access.user.id, id);
        if (!revoked) {
            return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });
        }

        log(`[API KEY] revoked ${id} for user ${access.user.id}`);
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        logerror("[API key revoke failed] : " + err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
