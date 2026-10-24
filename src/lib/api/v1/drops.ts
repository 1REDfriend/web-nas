import type { Drop } from "@prisma/client";
import { ENV } from "@/lib/ENV";
import { FileAccessError } from "@/lib/security/path-guard";
import { DropOwner, remainingDropQuota } from "@/lib/drops/drops";
import { ApiCaller, requireCallerScope, uploadLimitFor } from "./caller";

// What the /api/v1/drops routes share: who may drop, upload caps, and the JSON shape.

export function assertCanDrop(caller: ApiCaller) {
    requireCallerScope(caller, "drop");
    if (caller.user.role === "GUEST") {
        throw new FileAccessError("GUEST accounts cannot create drops", 403);
    }
}

export function dropOwner(caller: ApiCaller): DropOwner {
    return { userId: caller.user.id, keyId: caller.keyId };
}

// The smaller of the caller's upload cap and what is left of the user's drop quota
export async function dropUploadLimit(caller: ApiCaller): Promise<{ maxBytes: number; message: string }> {
    const keyLimit = uploadLimitFor(caller);
    const quota = await remainingDropQuota(caller.user.id);
    if (quota <= 0) throw new FileAccessError("Drop quota is full; delete a drop or wait for one to expire", 413);

    return quota < keyLimit
        ? { maxBytes: quota, message: "File is larger than what is left of your drop quota" }
        : { maxBytes: keyLimit, message: "File size exceeds limit" };
}

// Rejects early when Content-Length already says the body is too big
export function assertDeclaredSize(headers: Headers, limit: { maxBytes: number; message: string }) {
    const declared = Number(headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit.maxBytes) {
        throw new FileAccessError(limit.message, 413);
    }
}

const HOST_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;

// Address people outside use to reach the app, for links in responses
export function publicOrigin(headers: Headers, requestUrl?: string): string {
    if (ENV.PUBLIC_URL) return ENV.PUBLIC_URL;

    const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host") || "";
    const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
    const proto = forwardedProto === "https" || forwardedProto === "http"
        ? forwardedProto
        : requestUrl ? new URL(requestUrl).protocol.replace(":", "") : "http";

    if (HOST_RE.test(host)) return `${proto}://${host}`;
    return requestUrl ? new URL(requestUrl).origin : "";
}

export function toApiDrop(drop: Drop, origin: string) {
    return {
        id: drop.id,
        name: drop.fileName,
        size: drop.size,
        mimeType: drop.mimeType,
        createdAt: drop.createdAt,
        expiresAt: drop.expiresAt,
        maxDownloads: drop.maxDownloads,
        downloads: drop.downloads,
        url: `${origin}/d/${drop.id}`,
        downloadUrl: `${origin}/api/public/drops/${drop.id}/download`,
    };
}
