import fs from "fs-extra";
import { createHash, randomBytes } from "crypto";
import type { Drop, DropRequest } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MediaKind, mediaTypeOf } from "@/lib/file-manager/media";
import { FileAccessError } from "@/lib/security/path-guard";
import { DropRequestSettings, getDropRequestSettings } from "./settings";
import { dropFilePath, isDropAvailable } from "./drops";

// What people with a drop request link may see of the files it received, and the
// downloads they may make from its page.
//
//   none   nothing; they can only send
//   names  name, size and time of every file
//   own    the files they sent from this browser, with download and preview
//   all    every file, with download and preview
//
// Downloads go through a separate share id, never the drop id, so turning sharing
// off (or the admin switching a mode off) ends access at once.

export const SHARE_MODES = ["none", "names", "own", "all"] as const;
export type ShareMode = (typeof SHARE_MODES)[number];

export function isShareMode(value: unknown): value is ShareMode {
    return typeof value === "string" && (SHARE_MODES as readonly string[]).includes(value);
}

// Links made before share modes keep what they did: names, or nothing
export function storedMode(request: Pick<DropRequest, "shareMode" | "showReceived">): ShareMode {
    return isShareMode(request.shareMode) ? request.shareMode : request.showReceived ? "names" : "none";
}

// The mode in force right now: a mode the admin switched off falls back to a safer one
export function effectiveMode(request: Pick<DropRequest, "shareMode" | "showReceived">, settings: DropRequestSettings): ShareMode {
    const mode = storedMode(request);
    if (mode === "all" && !settings.allowAll) return "names";
    if (mode === "own" && !settings.allowOwn) return "none";
    return mode;
}

// What a new link starts with: as open as the admin allows
export function defaultShareMode(settings: DropRequestSettings): ShareMode {
    return settings.allowAll ? "all" : settings.allowOwn ? "own" : "names";
}

export function assertModeAllowed(mode: ShareMode, settings: DropRequestSettings) {
    if (mode === "all" && !settings.allowAll) throw new FileAccessError("The admin does not allow links where anyone can download every file", 403);
    if (mode === "own" && !settings.allowOwn) throw new FileAccessError("The admin does not allow links where senders download their own files", 403);
}

export const canDownload = (mode: ShareMode) => mode === "own" || mode === "all";

export function newShareId(): string {
    return randomBytes(18).toString("base64url");
}

// --- the sender's browser key: a random cookie, stored only as a hash on each drop ---

const SENDER_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
const SENDER_KEY_DAYS = 30;

export function senderCookieName(request: Pick<DropRequest, "id">): string {
    return `wn_req_me_${request.id}`;
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
    for (const part of (cookieHeader ?? "").split(";")) {
        const eq = part.indexOf("=");
        if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return undefined;
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

// Hash of this browser's key for the link, or null when it has none
export function senderKeyHash(request: Pick<DropRequest, "id">, cookieHeader: string | null | undefined): string | null {
    const key = readCookie(cookieHeader, senderCookieName(request));
    return key && SENDER_KEY_RE.test(key) ? hashKey(key) : null;
}

// The key to store with an upload: the browser's own, or a new one with the cookie to set
export function senderKeyFor(
    request: Pick<DropRequest, "id">,
    cookieHeader: string | null | undefined,
    secure: boolean
): { hash: string; setCookie: string | null } {
    const existing = readCookie(cookieHeader, senderCookieName(request));
    if (existing && SENDER_KEY_RE.test(existing)) return { hash: hashKey(existing), setCookie: null };

    const key = randomBytes(32).toString("base64url");
    const cookie = [
        `${senderCookieName(request)}=${key}`,
        "Path=/",
        `Max-Age=${SENDER_KEY_DAYS * 24 * 60 * 60}`,
        "HttpOnly",
        "SameSite=Lax",
        ...(secure ? ["Secure"] : []),
    ].join("; ");
    return { hash: hashKey(key), setCookie: cookie };
}

export function isSecureRequest(headers: { get(name: string): string | null }): boolean {
    return headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

// --- the list on the request page ---

const SHOWN = 200;

export type SharedFile = {
    id?: string;            // share id, only when the file can be downloaded
    name: string;
    size: string;
    createdAt: Date;
    expiresAt: Date;
    preview?: MediaKind | null;
    sender?: string | null; // only in "all" with showSenders
};

export async function sharedFiles(request: DropRequest, mode: ShareMode, cookieHeader: string | null | undefined): Promise<SharedFile[] | null> {
    if (mode === "none") return null;

    const keyHash = mode === "own" ? senderKeyHash(request, cookieHeader) : null;
    if (mode === "own" && !keyHash) return [];

    const drops = await prisma.drop.findMany({
        where: {
            requestId: request.id,
            deletedAt: null,
            completedAt: { not: null },
            expiresAt: { gt: new Date() },
            ...(mode === "own" ? { senderKeyHash: keyHash } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: SHOWN,
    });

    return drops.map((d) => ({
        ...(canDownload(mode) && d.shareId ? { id: d.shareId } : {}),
        name: d.fileName,
        size: String(d.size),
        createdAt: d.createdAt,
        expiresAt: d.expiresAt,
        ...(canDownload(mode) ? { preview: mediaTypeOf(d.fileName)?.kind ?? null } : {}),
        ...(mode === "all" && request.showSenders ? { sender: d.senderName } : {}),
    }));
}

// --- downloads from the request page ---

const SHARE_ID_RE = /^[A-Za-z0-9_-]{24}$/;
const NOT_FOUND = "This file is not available";

// The file behind a share id, if this browser may fetch it from this link right now
export async function findSharedFile(request: DropRequest, rawShareId: unknown, cookieHeader: string | null | undefined): Promise<Drop> {
    const mode = effectiveMode(request, await getDropRequestSettings());
    if (!canDownload(mode) || typeof rawShareId !== "string" || !SHARE_ID_RE.test(rawShareId)) {
        throw new FileAccessError(NOT_FOUND, 404);
    }

    const drop = await prisma.drop.findUnique({ where: { shareId: rawShareId } });
    if (!drop || drop.requestId !== request.id || !isDropAvailable(drop)) throw new FileAccessError(NOT_FOUND, 404);
    if (mode === "own" && (!drop.senderKeyHash || drop.senderKeyHash !== senderKeyHash(request, cookieHeader))) {
        throw new FileAccessError(NOT_FOUND, 404);
    }

    const stat = await fs.stat(dropFilePath(drop)).catch(() => null);
    if (!stat?.isFile()) throw new FileAccessError(NOT_FOUND, 404);
    return drop;
}

// Counts one download against the link's daily cap; refuses when the cap is reached
export async function claimLinkDownload(request: DropRequest) {
    const { dailyDownloads } = await getDropRequestSettings();
    const today = new Date().toISOString().slice(0, 10);
    const cap = dailyDownloads === 0 ? null : dailyDownloads;

    const count = await prisma.$executeRaw`
        UPDATE drop_requests
        SET download_count = CASE WHEN download_day = ${today} THEN download_count + 1 ELSE 1 END,
            download_day = ${today}
        WHERE id = ${request.id}
          AND (${cap} IS NULL OR download_day IS NULL OR download_day <> ${today} OR download_count < ${cap})`;
    if (count !== 1) {
        throw new FileAccessError("This link has reached its download limit for today. Try again tomorrow.", 429);
    }
}
