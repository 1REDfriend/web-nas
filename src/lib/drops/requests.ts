import { randomBytes } from "crypto";
import { Prisma, type DropRequest } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AccessUser, FileAccessError } from "@/lib/security/path-guard";
import { hashPassword } from "@/lib/security/credentials";
import { getDropLimits, getDropRequestSettings } from "./settings";
import { parseExtensions } from "./names";

// Drop requests: links the owner hands out so people without an account can send
// them files. Each file received becomes one of the owner's drops. This file is the
// owner's side (create, change, list); request-public.ts and receive.ts are the sender's.

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

export const REQUEST_DEFAULTS = { expiresInDays: 7, maxFileMB: 100, maxTotalMB: 5 * 1024 };
const MAX_DAYS = 365;
const MAX_FILE_MB = 100 * 1024;
const MAX_TOTAL_MB = 10 * 1024 * 1024;
const MAX_FILES = 100_000;
const MAX_REQUESTS_PER_USER = 50;
const PASSWORD_MIN = 4;
const PASSWORD_MAX_BYTES = 72;

// Link ids are 24 random characters; slugs are lower case words
export const REQUEST_ID_RE = /^[A-Za-z0-9_-]{24}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const REQUEST_LINK_RE = /^[A-Za-z0-9_-]{3,40}$/;

export type RequestStatus = "open" | "closed" | "full" | "expired";

export function requestStatus(request: DropRequest, now = new Date()): RequestStatus {
    if (request.expiresAt && request.expiresAt.getTime() <= now.getTime()) return "expired";
    if (request.closedAt) return "closed";
    if (request.maxFiles !== null && request.fileCount >= request.maxFiles) return "full";
    if (request.maxTotalBytes !== null && request.usedBytes >= request.maxTotalBytes) return "full";
    return "open";
}

// Throws unless requests are switched on and the user's role may create them
export async function assertCanRequest(user: AccessUser) {
    const settings = await getDropRequestSettings();
    if (!settings.enabled) throw new FileAccessError("Drop requests are switched off by the admin", 403);
    if (!settings.roles.includes(user.role)) {
        throw new FileAccessError(`${user.role} accounts cannot create drop requests`, 403);
    }
    return settings;
}

// --- input checks ---

export type RequestInput = {
    title?: unknown;
    description?: unknown;
    slug?: unknown;
    expiresInDays?: unknown;
    keepHours?: unknown;
    maxFileMB?: unknown;
    maxTotalMB?: unknown;
    maxFiles?: unknown;
    allowedExt?: unknown;
    password?: unknown;
    requireName?: unknown;
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

async function slugValue(raw: unknown, ownId: string | null): Promise<string | null> {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw !== "string" || !SLUG_RE.test(raw)) {
        throw new FileAccessError("Link name must be 3-40 characters: a-z, 0-9 and -, not starting or ending with -", 400);
    }
    // A slug may never shadow another request's random id (ids are looked up first)
    const clash = await prisma.dropRequest.findFirst({ where: { OR: [{ id: raw }, { slug: raw }], NOT: ownId ? { id: ownId } : undefined } });
    if (clash) throw new FileAccessError("That link name is already taken", 409);
    return raw;
}

function expiryValue(raw: unknown, allowNoExpiry: boolean): Date | null {
    if (raw === null) {
        if (!allowNoExpiry) throw new FileAccessError("Drop requests must have an end date", 400);
        return null;
    }
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > MAX_DAYS) {
        throw new FileAccessError(`expiresInDays must be a whole number from 1 to ${MAX_DAYS}`, 400);
    }
    return new Date(Date.now() + raw * DAY_MS);
}

// How long each received file is kept: within the admin's drop lifetimes
function keepValue(raw: unknown, maxHours: number): number {
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > maxHours) {
        throw new FileAccessError(`keepHours must be a whole number from 1 to ${maxHours}`, 400);
    }
    return raw;
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
async function toData(user: AccessUser, input: RequestInput, ownId: string | null, isNew: boolean) {
    const settings = await assertCanRequest(user);
    const limits = await getDropLimits();
    const pick = (key: keyof RequestInput, fallback: unknown) => (input[key] === undefined ? fallback : input[key]);
    const data: Prisma.DropRequestUncheckedUpdateInput = {};

    if (isNew || input.title !== undefined) data.title = text(input.title, "Title", 100, true)!;
    if (isNew || input.description !== undefined) data.description = text(input.description, "Description", 1000, false);
    if (input.slug !== undefined) data.slug = await slugValue(input.slug, ownId);
    if (isNew || input.expiresInDays !== undefined) {
        data.expiresAt = expiryValue(pick("expiresInDays", REQUEST_DEFAULTS.expiresInDays), settings.allowNoExpiry);
    }
    // Received files stay as long as drops may, unless the owner picks less
    if (isNew || input.keepHours !== undefined) data.keepHours = keepValue(pick("keepHours", limits.maxHours), limits.maxHours);
    if (isNew || input.maxFileMB !== undefined) {
        data.maxFileBytes = mbToBytes(limit(pick("maxFileMB", REQUEST_DEFAULTS.maxFileMB), "Largest file (MB)", MAX_FILE_MB));
    }
    if (isNew || input.maxTotalMB !== undefined) {
        data.maxTotalBytes = mbToBytes(limit(pick("maxTotalMB", REQUEST_DEFAULTS.maxTotalMB), "Total size (MB)", MAX_TOTAL_MB));
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
    if (input.showReceived !== undefined) data.showReceived = flag(input.showReceived, "showReceived");
    if (input.closed !== undefined) data.closedAt = flag(input.closed, "closed") ? new Date() : null;
    return data;
}

async function newRequestId(): Promise<string> {
    for (;;) {
        const id = randomBytes(18).toString("base64url");
        if (!(await prisma.dropRequest.findFirst({ where: { OR: [{ id }, { slug: id }] } }))) return id;
    }
}

function rethrowTaken(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new FileAccessError("That link name is already taken", 409);
    }
    throw err;
}

export async function createRequest(user: AccessUser, input: RequestInput): Promise<DropRequest> {
    const data = await toData(user, input, null, true);
    if ((await prisma.dropRequest.count({ where: { userId: user.id } })) >= MAX_REQUESTS_PER_USER) {
        throw new FileAccessError(`You can have at most ${MAX_REQUESTS_PER_USER} drop requests; delete one first`, 409);
    }
    return prisma.dropRequest
        .create({ data: { ...(data as Prisma.DropRequestUncheckedCreateInput), id: await newRequestId(), userId: user.id } })
        .catch(rethrowTaken);
}

export async function updateRequest(user: AccessUser, id: unknown, input: RequestInput): Promise<DropRequest | null> {
    const request = await findOwnRequest(user.id, id);
    if (!request) return null;
    const data = await toData(user, input, request.id, false);
    return prisma.dropRequest.update({ where: { id: request.id }, data }).catch(rethrowTaken);
}

export async function findOwnRequest(userId: string, id: unknown): Promise<DropRequest | null> {
    if (typeof id !== "string" || !REQUEST_ID_RE.test(id)) return null;
    return prisma.dropRequest.findFirst({ where: { id, userId } });
}

export async function listOwnRequests(userId: string): Promise<DropRequest[]> {
    return prisma.dropRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

// The drops it already received stay until they expire
export async function deleteRequest(userId: string, id: unknown): Promise<boolean> {
    const request = await findOwnRequest(userId, id);
    if (!request) return false;
    await prisma.dropRequest.delete({ where: { id: request.id } });
    return true;
}

export function requestUrl(request: Pick<DropRequest, "id" | "slug">, origin: string): string {
    return `${origin}/u/${request.slug ?? request.id}`;
}

const str = (value: bigint | null) => (value === null ? null : String(value));

// JSON for the owner (and the admin list)
export function toOwnerRequest(request: DropRequest, origin: string) {
    return {
        id: request.id,
        slug: request.slug,
        url: requestUrl(request, origin),
        title: request.title,
        description: request.description,
        requireName: request.requireName,
        showReceived: request.showReceived,
        allowedExt: request.allowedExt,
        maxFileBytes: str(request.maxFileBytes),
        maxTotalBytes: str(request.maxTotalBytes),
        maxFiles: request.maxFiles,
        keepHours: request.keepHours,
        hasPassword: request.passwordHash !== null,
        usedBytes: String(request.usedBytes),
        fileCount: request.fileCount,
        expiresAt: request.expiresAt,
        closedAt: request.closedAt,
        createdAt: request.createdAt,
        status: requestStatus(request),
    };
}
