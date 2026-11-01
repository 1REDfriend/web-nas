import { AccessUser, getAccessUser } from "@/lib/security/path-guard";
import { sessionTokenFromCookieHeader, verifySessionToken } from "@/lib/security/session";
import { hasBearer } from "@/lib/api/v1/auth";

// Streaming upload routes bypass proxy.ts (it would buffer the whole body in memory),
// so they check the login session themselves with the same rules and never trust
// x-user-payload. Browser sessions only: API keys upload through /api/v1.
export type BrowserUploadAuth =
    | { ok: true; user: AccessUser }
    | { ok: false; status: number; body: { error: string; code?: string } };

export async function authenticateBrowserUpload(headers: { authorization?: string | null; cookie?: string | null }): Promise<BrowserUploadAuth> {
    if (hasBearer(headers.authorization ?? undefined)) {
        return { ok: false, status: 401, body: { error: "API keys are not accepted here. Use /api/v1/files/upload." } };
    }

    const token = sessionTokenFromCookieHeader(headers.cookie ?? undefined);
    const session = await verifySessionToken(token);
    if (!session) {
        return { ok: false, status: 401, body: { error: token ? "Session expired. Please log in again." : "Authentication required." } };
    }
    if (session.mustChangePassword) {
        return { ok: false, status: 403, body: { error: "Password change required.", code: "PASSWORD_CHANGE_REQUIRED" } };
    }

    const user = await getAccessUser(session.userId);
    if (!user) return { ok: false, status: 401, body: { error: "Authentication required." } };
    return { ok: true, user };
}
