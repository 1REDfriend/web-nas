import { AccessUser, getAccessUser } from "@/lib/security/path-guard";
import { API_SCOPES, ApiScope, parseScopes } from "@/lib/security/api-key-format";
import { xUserPayload } from "@/lib/api/user/x-user-payload";

// Who is calling an /api/v1 route. proxy.ts has already checked the API key or
// session; this only reads what it passed on.
export type ApiCaller = {
    user: AccessUser;
    username: string;
    via: "session" | "apikey";
    keyId: string | null;
    scopes: ApiScope[];
    // Virtual path the API key is locked to; null = no extra limit
    rootPath: string | null;
};

export async function getApiCaller(): Promise<ApiCaller | null> {
    const payload = await xUserPayload();
    if (!payload) return null;

    const user = await getAccessUser(payload.sub);
    if (!user) return null;

    if (payload.via === "apikey") {
        if (!payload.keyId) return null;
        return {
            user,
            username: payload.username,
            via: "apikey",
            keyId: payload.keyId,
            scopes: parseScopes(payload.scopes ?? []),
            rootPath: payload.keyRoot ?? null,
        };
    }

    // A logged-in browser session can do everything its user can
    return {
        user,
        username: payload.username,
        via: "session",
        keyId: null,
        scopes: [...API_SCOPES],
        rootPath: null,
    };
}
