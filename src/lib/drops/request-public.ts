import { createHmac, timingSafeEqual } from "crypto";
import type { DropRequest } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ENV } from "@/lib/ENV";
import { AccessUser, FileAccessError, getAccessUser } from "@/lib/security/path-guard";
import { getClientIp, recordAttempt, resetLimits, retryAfterSeconds } from "@/lib/security/rate-limit";
import { verifyPassword } from "@/lib/security/credentials";
import { REQUEST_ID_RE, REQUEST_LINK_RE, requestStatus } from "./requests";
import { getDropRequestSettings } from "./settings";
import { remainingDropQuota } from "./drops";
import { parseExtensions } from "./names";

// What people with a drop request link (no login) may see and do.
//
// Unknown, expired, deleted and switched-off links all get the same 404, and nothing
// here tells a visitor who owns the link.

const GONE = "This link has expired or does not exist";
const UNLOCK_HOURS = 12;

export type PublicRequest = { request: DropRequest; owner: AccessUser };

// Finds the request behind /u/<id or slug>, still usable by its owner
export async function findPublicRequest(rawLink: unknown): Promise<PublicRequest> {
    if (typeof rawLink !== "string" || !REQUEST_LINK_RE.test(rawLink)) throw new FileAccessError(GONE, 404);

    // Random ids win over slugs; creating a slug that equals an id is refused
    const request = (REQUEST_ID_RE.test(rawLink) ? await prisma.dropRequest.findUnique({ where: { id: rawLink } }) : null)
        ?? await prisma.dropRequest.findUnique({ where: { slug: rawLink } });
    if (!request || requestStatus(request) === "expired") throw new FileAccessError(GONE, 404);

    const settings = await getDropRequestSettings();
    const owner = await getAccessUser(request.userId);
    if (!settings.enabled || !owner || !settings.roles.includes(owner.role)) throw new FileAccessError(GONE, 404);
    return { request, owner };
}

// --- password unlock: a short-lived cookie per request, tied to the current password ---

export function unlockCookieName(request: Pick<DropRequest, "id">): string {
    return `wn_req_${request.id}`;
}

function sign(request: DropRequest, expires: number): string {
    return createHmac("sha256", ENV.JWT_SECRET)
        .update(`drop-request-unlock.${request.id}.${expires}.${request.passwordHash ?? ""}`)
        .digest("base64url");
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
    for (const part of (cookieHeader ?? "").split(";")) {
        const eq = part.indexOf("=");
        if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return undefined;
}

export function isUnlocked(request: DropRequest, cookieHeader: string | null | undefined): boolean {
    if (!request.passwordHash) return true;
    const value = readCookie(cookieHeader, unlockCookieName(request));
    const [rawExpires, signature] = (value ?? "").split(".");
    const expires = Number(rawExpires);
    if (!signature || !Number.isInteger(expires) || expires <= Date.now()) return false;

    const expected = Buffer.from(sign(request, expires));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

const UNLOCK_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

// Checks the password; returns the cookie value to set. Wrong guesses are rate limited per IP and link.
export async function unlockRequest(httpRequest: { headers: Headers }, request: DropRequest, password: unknown): Promise<{ value: string; maxAge: number }> {
    const rules = [{ key: `drop-request-unlock:${getClientIp(httpRequest)}:${request.id}`, ...UNLOCK_LIMIT }];
    const wait = retryAfterSeconds(rules);
    if (wait > 0) throw new FileAccessError(`Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} minute(s).`, 429);

    if (!request.passwordHash) return { value: "", maxAge: 0 };
    if (typeof password !== "string" || !(await verifyPassword(password, request.passwordHash))) {
        recordAttempt(rules);
        throw new FileAccessError("Wrong password", 403);
    }
    resetLimits(rules.map((r) => r.key));

    const maxAge = UNLOCK_HOURS * 60 * 60;
    const expires = Date.now() + maxAge * 1000;
    return { value: `${expires}.${sign(request, expires)}`, maxAge };
}

export function unlockCookie(request: DropRequest, value: string, maxAge: number, secure: boolean): string {
    return [
        `${unlockCookieName(request)}=${value}`,
        "Path=/",
        `Max-Age=${maxAge}`,
        "HttpOnly",
        "SameSite=Lax",
        ...(secure ? ["Secure"] : []),
    ].join("; ");
}

// Bytes the link may still take: the smaller of its own total and the owner's drop quota; Infinity = no cap
export async function remainingBytes(request: DropRequest): Promise<number> {
    const linkLeft = request.maxTotalBytes === null ? Infinity : Number(request.maxTotalBytes - request.usedBytes);
    return Math.max(0, Math.min(linkLeft, await remainingDropQuota(request.userId)));
}

const RECEIVED_SHOWN = 100;

// JSON for the sender's page
export async function toPublicRequest(request: DropRequest, unlocked: boolean) {
    const status = requestStatus(request);
    const left = await remainingBytes(request);
    const base = {
        title: request.title,
        description: request.description,
        needsPassword: request.passwordHash !== null,
        locked: !unlocked,
        status: status === "open" && left <= 0 ? "full" : status,
        expiresAt: request.expiresAt,
    };
    if (!unlocked) return base;

    // Names and sizes only: received files are never downloadable from here
    const received = request.showReceived
        ? (await prisma.drop.findMany({
            where: { requestId: request.id, completedAt: { not: null } },
            orderBy: { createdAt: "desc" },
            take: RECEIVED_SHOWN,
            select: { fileName: true, size: true, createdAt: true },
        })).map((d) => ({ name: d.fileName, size: String(d.size), createdAt: d.createdAt }))
        : null;

    return {
        ...base,
        requireName: request.requireName,
        allowedExt: parseExtensions(request.allowedExt),
        maxFileBytes: request.maxFileBytes === null ? null : String(request.maxFileBytes),
        bytesLeft: Number.isFinite(left) ? String(left) : null,
        filesLeft: request.maxFiles === null ? null : Math.max(0, request.maxFiles - request.fileCount),
        received,
    };
}
