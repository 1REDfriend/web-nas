import type { ApiScope } from "@/lib/security/api-key-format";

// Shape of the x-user-payload header set by proxy.ts for a valid session or API key
export interface UserJwtPayload {
    sub: string;
    sid?: string;                   // login session id; absent for API keys
    username: string;
    role: "ADMIN" | "USER" | "GUEST";
    via?: "session" | "apikey";
    // Only for API keys (only ever set on /api/v1 routes)
    keyId?: string;
    scopes?: ApiScope[];
    keyRoot?: string | null;
}
