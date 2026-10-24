import type { UserJwtPayload } from "@/interfaces/userJwtpayload";
import { verifySessionToken } from "@/lib/security/session";
import { canUseApiKeys, verifyApiKey } from "@/lib/security/api-key";
import { apiKeyFromAuthorization } from "@/lib/security/api-key-format";
import { LimitRule, recordAttempt, retryAfterSeconds } from "@/lib/security/rate-limit";
import { ApiErrorCode, apiError } from "./response";

// Authentication for /api/v1, shared by proxy.ts and the upload routes that bypass
// it (proxy.ts buffers request bodies in memory, so large uploads skip it).
//
// An "Authorization: Bearer ..." request is judged on the key alone; a browser
// cookie sent alongside it is ignored, so a bad key never falls back to it.

const BAD_KEY_WINDOW_MS = 15 * 60 * 1000;
const BAD_KEY_LIMIT = 20;

export type V1AuthInput = {
    authorization: string | null | undefined;
    sessionToken: string | null | undefined;
    ip: string;
};

export type V1AuthResult =
    | { ok: true; payload: UserJwtPayload }
    | { ok: false; status: number; code: ApiErrorCode; message: string; retryAfter?: number; clearCookie?: boolean };

function badKeyLimits(ip: string): LimitRule[] {
    return [{ key: `apikey-fail:ip:${ip}`, limit: BAD_KEY_LIMIT, windowMs: BAD_KEY_WINDOW_MS }];
}

export function hasBearer(authorization: string | null | undefined): authorization is string {
    return !!authorization && /^Bearer\s/i.test(authorization);
}

async function authenticateApiKey(authorization: string, ip: string): Promise<V1AuthResult> {
    const limits = badKeyLimits(ip);
    const wait = retryAfterSeconds(limits);
    if (wait > 0) {
        return { ok: false, status: 429, code: "RATE_LIMITED", message: "Too many invalid API keys. Try again later.", retryAfter: wait };
    }

    const principal = await verifyApiKey(apiKeyFromAuthorization(authorization), ip);
    if (!principal) {
        recordAttempt(limits);
        return { ok: false, status: 401, code: "INVALID_API_KEY", message: "Invalid or expired API key." };
    }
    if (!canUseApiKeys(principal.role)) {
        return { ok: false, status: 403, code: "API_KEY_NOT_ALLOWED", message: "This account cannot use API keys." };
    }
    if (principal.mustChangePassword) {
        return { ok: false, status: 403, code: "PASSWORD_CHANGE_REQUIRED", message: "The key owner must change their password first." };
    }

    return {
        ok: true,
        payload: {
            sub: principal.userId,
            username: principal.username,
            role: principal.role,
            via: "apikey",
            keyId: principal.keyId,
            scopes: principal.scopes,
            keyRoot: principal.rootPath,
        },
    };
}

export async function authenticateV1({ authorization, sessionToken, ip }: V1AuthInput): Promise<V1AuthResult> {
    if (hasBearer(authorization)) {
        return authenticateApiKey(authorization, ip);
    }

    const user = await verifySessionToken(sessionToken);
    if (!user) {
        return sessionToken
            ? { ok: false, status: 401, code: "UNAUTHORIZED", message: "Session expired. Please log in again.", clearCookie: true }
            : { ok: false, status: 401, code: "UNAUTHORIZED", message: "Authentication required." };
    }
    if (user.mustChangePassword) {
        return { ok: false, status: 403, code: "PASSWORD_CHANGE_REQUIRED", message: "Password change required." };
    }

    return {
        ok: true,
        payload: { sub: user.userId, sid: user.sessionId, username: user.username, role: user.role, via: "session" },
    };
}

export function v1AuthErrorResponse(result: Extract<V1AuthResult, { ok: false }>) {
    return apiError(
        result.status,
        result.code,
        result.message,
        result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined
    );
}
