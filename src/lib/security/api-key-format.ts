import { createHash, randomBytes } from "crypto";
import path from "path";

// Pure helpers for API keys: no database access, so they can be unit-tested on their own.
//
// Key layout: wnas_<prefix>_<secret>
//   prefix: 8 hex chars, stored in plain text to find the row and to show in the UI
//   secret: 32 random bytes, base64url (43 chars); only the sha256 of the whole key is stored

export const API_KEY_TAG = "wnas";
const PREFIX_BYTES = 4;
const SECRET_BYTES = 32;
const API_KEY_PATTERN = /^wnas_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;

export const API_SCOPES = ["list", "read", "upload", "delete"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export type GeneratedApiKey = { fullKey: string; prefix: string; keyHash: string };

export function hashApiKey(fullKey: string): string {
    return createHash("sha256").update(fullKey).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
    const prefix = randomBytes(PREFIX_BYTES).toString("hex");
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    const fullKey = `${API_KEY_TAG}_${prefix}_${secret}`;
    return { fullKey, prefix, keyHash: hashApiKey(fullKey) };
}

// Returns the prefix of a well-formed key, or null for anything else
export function parseApiKey(raw: unknown): { prefix: string } | null {
    if (typeof raw !== "string") return null;
    const match = API_KEY_PATTERN.exec(raw);
    return match ? { prefix: match[1] } : null;
}

// Reads "Authorization: Bearer <key>"; null when the header is missing or is not an API key
export function apiKeyFromAuthorization(header: string | null | undefined): string | null {
    if (!header) return null;
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    if (!match || !parseApiKey(match[1])) return null;
    return match[1];
}

function isApiScope(value: string): value is ApiScope {
    return (API_SCOPES as readonly string[]).includes(value);
}

// Unknown entries are dropped, so a stored value can never grant more than the known scopes
export function parseScopes(raw: string | readonly string[] | null | undefined): ApiScope[] {
    const items = typeof raw === "string" ? raw.split(",") : raw ?? [];
    const wanted = new Set(items.map((item) => item.trim().toLowerCase()).filter(isApiScope));
    return API_SCOPES.filter((scope) => wanted.has(scope));
}

export function serializeScopes(scopes: readonly ApiScope[]): string {
    return parseScopes(scopes).join(",");
}

// Lexical check on normalized virtual paths ("/a/b"). A null root means the key is not locked to a folder.
export function isInsideKeyRoot(virtualPath: string, keyRoot: string | null): boolean {
    if (keyRoot === null) return true;
    const rel = path.posix.relative(keyRoot, virtualPath);
    return rel === "" || (rel !== ".." && !rel.startsWith("../") && !path.posix.isAbsolute(rel));
}
