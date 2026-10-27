import { createHmac, timingSafeEqual } from "crypto";
import type { Inbox } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ENV } from "@/lib/ENV";
import { AccessUser, FileAccessError, getAccessUser } from "@/lib/security/path-guard";
import { getClientIp, recordAttempt, resetLimits, retryAfterSeconds } from "@/lib/security/rate-limit";
import { verifyPassword } from "@/lib/security/credentials";
import { INBOX_ID_RE, INBOX_LINK_RE, inboxStatus } from "./inboxes";
import { getInboxSettings, quotaBytes } from "./settings";
import { parseExtensions } from "./names";

// What people with an inbox link (no login) may see and do.
//
// Unknown, expired, deleted and switched-off links all get the same 404, and nothing
// here tells a visitor who owns the link or which folder the files go to.

const GONE = "This upload link has expired or does not exist";
const UNLOCK_HOURS = 12;

export type PublicInbox = { inbox: Inbox; owner: AccessUser };

// Finds the inbox behind /u/<id or slug>, still usable by its owner
export async function findPublicInbox(rawLink: unknown): Promise<PublicInbox> {
    if (typeof rawLink !== "string" || !INBOX_LINK_RE.test(rawLink)) throw new FileAccessError(GONE, 404);

    // Random ids win over slugs; creating a slug that equals an id is refused
    const inbox = (INBOX_ID_RE.test(rawLink) ? await prisma.inbox.findUnique({ where: { id: rawLink } }) : null)
        ?? await prisma.inbox.findUnique({ where: { slug: rawLink } });
    if (!inbox || inboxStatus(inbox) === "expired") throw new FileAccessError(GONE, 404);

    const settings = await getInboxSettings();
    const owner = await getAccessUser(inbox.userId);
    if (!settings.enabled || !owner || !settings.roles.includes(owner.role)) throw new FileAccessError(GONE, 404);
    return { inbox, owner };
}

// --- password unlock: a short-lived cookie per inbox, tied to the current password ---

export function unlockCookieName(inbox: Pick<Inbox, "id">): string {
    return `wn_inbox_${inbox.id}`;
}

function sign(inbox: Inbox, expires: number): string {
    return createHmac("sha256", ENV.JWT_SECRET)
        .update(`inbox-unlock.${inbox.id}.${expires}.${inbox.passwordHash ?? ""}`)
        .digest("base64url");
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
    for (const part of (cookieHeader ?? "").split(";")) {
        const eq = part.indexOf("=");
        if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return undefined;
}

export function isUnlocked(inbox: Inbox, cookieHeader: string | null | undefined): boolean {
    if (!inbox.passwordHash) return true;
    const value = readCookie(cookieHeader, unlockCookieName(inbox));
    const [rawExpires, signature] = (value ?? "").split(".");
    const expires = Number(rawExpires);
    if (!signature || !Number.isInteger(expires) || expires <= Date.now()) return false;

    const expected = Buffer.from(sign(inbox, expires));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

const UNLOCK_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

// Checks the password; returns the cookie value to set. Wrong guesses are rate limited per IP and link.
export async function unlockInbox(request: { headers: Headers }, inbox: Inbox, password: unknown): Promise<{ value: string; maxAge: number }> {
    const rules = [{ key: `inbox-unlock:${getClientIp(request)}:${inbox.id}`, ...UNLOCK_LIMIT }];
    const wait = retryAfterSeconds(rules);
    if (wait > 0) throw new FileAccessError(`Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} minute(s).`, 429);

    if (!inbox.passwordHash) return { value: "", maxAge: 0 };
    if (typeof password !== "string" || !(await verifyPassword(password, inbox.passwordHash))) {
        recordAttempt(rules);
        throw new FileAccessError("Wrong password", 403);
    }
    resetLimits(rules.map((r) => r.key));

    const maxAge = UNLOCK_HOURS * 60 * 60;
    const expires = Date.now() + maxAge * 1000;
    return { value: `${expires}.${sign(inbox, expires)}`, maxAge };
}

export function unlockCookie(inbox: Inbox, value: string, maxAge: number, secure: boolean): string {
    return [
        `${unlockCookieName(inbox)}=${value}`,
        "Path=/",
        `Max-Age=${maxAge}`,
        "HttpOnly",
        "SameSite=Lax",
        ...(secure ? ["Secure"] : []),
    ].join("; ");
}

// --- what is left ---

// Bytes the link may still take: the smaller of its own total and the owner's quota; Infinity = no cap
export async function remainingBytes(inbox: Inbox): Promise<number> {
    const settings = await getInboxSettings();
    const quota = quotaBytes(settings);
    let left = inbox.maxTotalBytes === null ? Infinity : Number(inbox.maxTotalBytes - inbox.usedBytes);
    if (quota !== null) {
        const used = await prisma.inbox.aggregate({ where: { userId: inbox.userId }, _sum: { usedBytes: true } });
        left = Math.min(left, quota - Number(used._sum.usedBytes ?? 0));
    }
    return Math.max(0, left);
}

const RECEIVED_SHOWN = 100;

// JSON for the upload page
export async function toPublicInbox(inbox: Inbox, unlocked: boolean) {
    const status = inboxStatus(inbox);
    const left = await remainingBytes(inbox);
    const base = {
        title: inbox.title,
        description: inbox.description,
        needsPassword: inbox.passwordHash !== null,
        locked: !unlocked,
        status: status === "open" && left <= 0 ? "full" : status,
        expiresAt: inbox.expiresAt,
    };
    if (!unlocked) return base;

    const received = inbox.showReceived
        ? (await prisma.inboxUpload.findMany({
            where: { inboxId: inbox.id },
            orderBy: { createdAt: "desc" },
            take: RECEIVED_SHOWN,
            select: { fileName: true, size: true, createdAt: true },
        })).map((u) => ({ name: u.fileName, size: String(u.size), createdAt: u.createdAt }))
        : null;

    return {
        ...base,
        requireName: inbox.requireName,
        allowedExt: parseExtensions(inbox.allowedExt),
        maxFileBytes: inbox.maxFileBytes === null ? null : String(inbox.maxFileBytes),
        bytesLeft: Number.isFinite(left) ? String(left) : null,
        filesLeft: inbox.maxFiles === null ? null : Math.max(0, inbox.maxFiles - inbox.fileCount),
        received,
    };
}
