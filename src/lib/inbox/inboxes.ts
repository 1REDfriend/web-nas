import fs from "fs-extra";
import { randomBytes } from "crypto";
import { Prisma, type Inbox } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AccessUser, FileAccessError, authorizePath } from "@/lib/security/path-guard";
import { hashPassword } from "@/lib/security/credentials";
import { getInboxSettings, quotaBytes } from "./settings";
import { parseExtensions } from "./names";

// Creating, changing and listing inboxes for their owner. Callers check the session.

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

export const INBOX_DEFAULTS = { expiresInDays: 7, maxFileMB: 100, maxTotalMB: 5 * 1024 };
const MAX_DAYS = 365;
const MAX_FILE_MB = 100 * 1024;
const MAX_TOTAL_MB = 10 * 1024 * 1024;
const MAX_FILES = 100_000;
const MAX_INBOXES_PER_USER = 50;
const PASSWORD_MIN = 4;
const PASSWORD_MAX_BYTES = 72;

// Link ids are 24 random characters; slugs are lower case words
export const INBOX_ID_RE = /^[A-Za-z0-9_-]{24}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const INBOX_LINK_RE = /^[A-Za-z0-9_-]{3,40}$/;

export type InboxStatus = "open" | "closed" | "full" | "expired";

export function inboxStatus(inbox: Inbox, now = new Date()): InboxStatus {
    if (inbox.expiresAt && inbox.expiresAt.getTime() <= now.getTime()) return "expired";
    if (inbox.closedAt) return "closed";
    if (inbox.maxFiles !== null && inbox.fileCount >= inbox.maxFiles) return "full";
    if (inbox.maxTotalBytes !== null && inbox.usedBytes >= inbox.maxTotalBytes) return "full";
    return "open";
}

// Throws unless inboxes are switched on and the user's role may create them
export async function assertCanUseInboxes(user: AccessUser) {
    const settings = await getInboxSettings();
    if (!settings.enabled) throw new FileAccessError("Upload links are switched off by the admin", 403);
    if (!settings.roles.includes(user.role)) {
        throw new FileAccessError(`${user.role} accounts cannot create upload links`, 403);
    }
    return settings;
}

export async function inboxUsage(userId: string): Promise<{ usedBytes: number; limitBytes: number | null }> {
    const [settings, used] = await Promise.all([
        getInboxSettings(),
        prisma.inbox.aggregate({ where: { userId }, _sum: { usedBytes: true } }),
    ]);
    return { usedBytes: Number(used._sum.usedBytes ?? 0), limitBytes: quotaBytes(settings) };
}

// --- input checks ---

export type InboxInput = {
    title?: unknown;
    description?: unknown;
    targetPath?: unknown;
    slug?: unknown;
    expiresInDays?: unknown;
    maxFileMB?: unknown;
    maxTotalMB?: unknown;
    maxFiles?: unknown;
    allowedExt?: unknown;
    password?: unknown;
    requireName?: unknown;
    splitBySender?: unknown;
    showReceived?: unknown;
    closed?: unknown;
};

function text(value: unknown, label: string, max: number, required: boolean): string | null {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
        if (required) throw new FileAccessError(`${label} is required`, 400);
        return null;
    }
    if (typeof value !== "string") throw new FileAccessError(`${label} must be text`, 400);
    const trimmed = value.trim();
    if (Array.from(trimmed).length > max) throw new FileAccessError(`${label} can be at most ${max} characters`, 400);
    return trimmed;
}

// null = no limit
function limit(value: unknown, label: string, max: number): number | null {
    if (value === null || value === "") return null;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
        throw new FileAccessError(`${label} must be a whole number from 1 to ${max}, or empty for no limit`, 400);
    }
    return value;
}

function flag(value: unknown, label: string): boolean {
    if (typeof value !== "boolean") throw new FileAccessError(`${label} must be true or false`, 400);
    return value;
}

async function targetFolder(user: AccessUser, raw: unknown): Promise<string> {
    if (typeof raw !== "string" || raw.trim() === "") throw new FileAccessError("Pick the folder files should go to", 400);
    const target = await authorizePath(user, raw, "UPLOAD");
    const stat = await fs.stat(target.physicalPath).catch(() => null);
    if (stat && !stat.isDirectory()) throw new FileAccessError("The target must be a folder, not a file", 400);
    return target.virtualPath;
}

async function slugValue(raw: unknown, ownId: string | null): Promise<string | null> {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw !== "string" || !SLUG_RE.test(raw)) {
        throw new FileAccessError("Link name must be 3-40 characters: a-z, 0-9 and -, not starting or ending with -", 400);
    }
    // A slug may never shadow another inbox's random id (ids are looked up first)
    const clash = await prisma.inbox.findFirst({ where: { OR: [{ id: raw }, { slug: raw }], NOT: ownId ? { id: ownId } : undefined } });
    if (clash) throw new FileAccessError("That link name is already taken", 409);
    return raw;
}

async function expiryValue(raw: unknown, allowNoExpiry: boolean): Promise<Date | null> {
    if (raw === null) {
        if (!allowNoExpiry) throw new FileAccessError("Upload links must have an expiry date", 400);
        return null;
    }
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > MAX_DAYS) {
        throw new FileAccessError(`expiresInDays must be a whole number from 1 to ${MAX_DAYS}`, 400);
    }
    return new Date(Date.now() + raw * DAY_MS);
}

async function passwordValue(raw: unknown): Promise<string | null> {
    if (raw === null || raw === "") return null;
    if (typeof raw !== "string" || raw.length < PASSWORD_MIN || Buffer.byteLength(raw, "utf8") > PASSWORD_MAX_BYTES) {
        throw new FileAccessError(`Password must be ${PASSWORD_MIN} to ${PASSWORD_MAX_BYTES} bytes long`, 400);
    }
    return hashPassword(raw);
}

const mbToBytes = (mb: number | null) => (mb === null ? null : BigInt(mb) * BigInt(MB));

// Turns the fields that were sent into database values; fields left out are not touched
async function toData(user: AccessUser, input: InboxInput, ownId: string | null, isNew: boolean) {
    const settings = await assertCanUseInboxes(user);
    const sent = (key: keyof InboxInput) => isNew || input[key] !== undefined;
    const data: Prisma.InboxUncheckedUpdateInput = {};

    if (sent("title")) data.title = text(input.title, "Title", 100, true)!;
    if (sent("description")) data.description = text(input.description, "Description", 1000, false);
    if (sent("targetPath")) data.targetPath = await targetFolder(user, input.targetPath);
    if (input.slug !== undefined) data.slug = await slugValue(input.slug, ownId);
    if (input.expiresInDays !== undefined || isNew) {
        data.expiresAt = await expiryValue(input.expiresInDays === undefined ? INBOX_DEFAULTS.expiresInDays : input.expiresInDays, settings.allowNoExpiry);
    }
    if (input.maxFileMB !== undefined || isNew) {
        data.maxFileBytes = mbToBytes(limit(input.maxFileMB === undefined ? INBOX_DEFAULTS.maxFileMB : input.maxFileMB, "Largest file (MB)", MAX_FILE_MB));
    }
    if (input.maxTotalMB !== undefined || isNew) {
        data.maxTotalBytes = mbToBytes(limit(input.maxTotalMB === undefined ? INBOX_DEFAULTS.maxTotalMB : input.maxTotalMB, "Total size (MB)", MAX_TOTAL_MB));
    }
    if (input.maxFiles !== undefined) data.maxFiles = limit(input.maxFiles, "Number of files", MAX_FILES);
    if (input.allowedExt !== undefined) {
        if (input.allowedExt !== null && typeof input.allowedExt !== "string") throw new FileAccessError("allowedExt must be text", 400);
        const list = parseExtensions(input.allowedExt);
        if (list && (list.length > 50 || list.some((e) => !/^[a-z0-9]{1,16}$/.test(e)))) {
            throw new FileAccessError("File types must be up to 50 extensions like pdf, docx, zip", 400);
        }
        data.allowedExt = list ? list.join(",") : null;
    }
    if (input.password !== undefined) data.passwordHash = await passwordValue(input.password);
    if (input.requireName !== undefined) data.requireName = flag(input.requireName, "requireName");
    if (input.splitBySender !== undefined) data.splitBySender = flag(input.splitBySender, "splitBySender");
    if (input.showReceived !== undefined) data.showReceived = flag(input.showReceived, "showReceived");
    if (input.closed !== undefined) data.closedAt = flag(input.closed, "closed") ? new Date() : null;
    return data;
}

async function newInboxId(): Promise<string> {
    for (;;) {
        const id = randomBytes(18).toString("base64url");
        if (!(await prisma.inbox.findFirst({ where: { OR: [{ id }, { slug: id }] } }))) return id;
    }
}

function rethrowTaken(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new FileAccessError("That link name is already taken", 409);
    }
    throw err;
}

export async function createInbox(user: AccessUser, input: InboxInput): Promise<Inbox> {
    const data = await toData(user, input, null, true);
    if ((await prisma.inbox.count({ where: { userId: user.id } })) >= MAX_INBOXES_PER_USER) {
        throw new FileAccessError(`You can have at most ${MAX_INBOXES_PER_USER} upload links; delete one first`, 409);
    }
    return prisma.inbox
        .create({ data: { ...(data as Prisma.InboxUncheckedCreateInput), id: await newInboxId(), userId: user.id } })
        .catch(rethrowTaken);
}

export async function updateInbox(user: AccessUser, id: string, input: InboxInput): Promise<Inbox | null> {
    const inbox = await findOwnInbox(user.id, id);
    if (!inbox) return null;
    const data = await toData(user, input, inbox.id, false);
    return prisma.inbox.update({ where: { id: inbox.id }, data }).catch(rethrowTaken);
}

export async function findOwnInbox(userId: string, id: unknown): Promise<Inbox | null> {
    if (typeof id !== "string" || !INBOX_ID_RE.test(id)) return null;
    return prisma.inbox.findFirst({ where: { id, userId } });
}

export async function listOwnInboxes(userId: string): Promise<Inbox[]> {
    return prisma.inbox.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

// The files already received stay where they are
export async function deleteInbox(userId: string, id: unknown): Promise<boolean> {
    const inbox = await findOwnInbox(userId, id);
    if (!inbox) return false;
    await prisma.inbox.delete({ where: { id: inbox.id } });
    return true;
}

export function inboxUrl(inbox: Pick<Inbox, "id" | "slug">, origin: string): string {
    return `${origin}/u/${inbox.slug ?? inbox.id}`;
}

const str = (value: bigint | null) => (value === null ? null : String(value));

// JSON for the owner (and the admin list)
export function toOwnerInbox(inbox: Inbox, origin: string) {
    return {
        id: inbox.id,
        slug: inbox.slug,
        url: inboxUrl(inbox, origin),
        title: inbox.title,
        description: inbox.description,
        targetPath: inbox.targetPath,
        splitBySender: inbox.splitBySender,
        requireName: inbox.requireName,
        showReceived: inbox.showReceived,
        allowedExt: inbox.allowedExt,
        maxFileBytes: str(inbox.maxFileBytes),
        maxTotalBytes: str(inbox.maxTotalBytes),
        maxFiles: inbox.maxFiles,
        hasPassword: inbox.passwordHash !== null,
        usedBytes: String(inbox.usedBytes),
        fileCount: inbox.fileCount,
        expiresAt: inbox.expiresAt,
        closedAt: inbox.closedAt,
        createdAt: inbox.createdAt,
        status: inboxStatus(inbox),
    };
}
