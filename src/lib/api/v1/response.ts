import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { FileAccessError } from "@/lib/security/path-guard";

// Every /api/v1 response has one of two shapes:
//   { ok: true, data }
//   { ok: false, error, code }
// `code` is stable for programs to branch on; `error` is a human-readable message.

export type ApiErrorCode =
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "INVALID_API_KEY"
    | "PASSWORD_CHANGE_REQUIRED"
    | "API_KEY_NOT_ALLOWED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "PAYLOAD_TOO_LARGE"
    | "RATE_LIMITED"
    | "INTERNAL";

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    429: "RATE_LIMITED",
};

// BigInt (e.g. byte sizes) cannot go through JSON.stringify as-is
function toJsonSafe(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export function apiOk(data: unknown, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data: toJsonSafe(data) }, init);
}

export function apiError(status: number, code: ApiErrorCode, message: string, headers?: HeadersInit) {
    return NextResponse.json({ ok: false, error: message, code }, { status, headers });
}

export function apiErrorFromException(err: unknown, context: string) {
    if (err instanceof FileAccessError) {
        return apiError(err.status, CODE_BY_STATUS[err.status] ?? "INTERNAL", err.message);
    }
    logerror(`[API v1 ${context}] : ${err}`);
    return apiError(500, "INTERNAL", "Internal error");
}
