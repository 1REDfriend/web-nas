import path from "path";
import fs from "fs-extra";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import type { PinItem, PinRoom } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ENV } from "@/lib/ENV";
import { log, logerror } from "@/lib/logger";
import { MediaKind, mediaTypeOf } from "@/lib/file-manager/media";
import { FileAccessError } from "@/lib/security/path-guard";
import { getClientIp, recordAttempt, retryAfterSeconds } from "@/lib/security/rate-limit";
import { currentDropBase, invalidateDropBases } from "@/lib/drops/locations";
import { ensureDropBase } from "@/lib/drops/maintenance";
import { assertDiskRoom } from "@/lib/drops/receive";
import { PinSettings, getPinSettings } from "./settings";

// PIN rooms: a short-lived public space for moving files and notes between devices.
//
//   create  anyone (no login) makes a room and gets its PIN
//   join    anyone who types the PIN joins; wrong guesses are rate limited
//   use     every member may add files and notes and fetch everything in the room
//
// A member is a browser holding the signed cookie `wn_pin` (room id, a random member
// key, a signature). Nothing about members is stored except the sha256 of each key
// that made the room or added an item, which decides who may delete what.
//
// PINs start at 4 digits. Once more than 1% of the PINs of the current length are in
// use, new rooms get one digit more (up to 8), so a random guess rarely hits a room.
// When a room is deleted (expired, closed by its maker or by an admin) its PIN, its
// files and its rows go with it.

export const PIN_FOLDER = ".webnas-pin";
export const MIN_DIGITS = 4;
export const MAX_DIGITS = 8;
const FILL_SHARE = 0.01;
export const NOTE_MAX_CHARS = 20_000;

const MB = 1024 * 1024;
const COOKIE = "wn_pin";
const ROOM_ID_RE = /^[A-Za-z0-9_-]{24}$/;
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
export const ITEM_ID_RE = /^[A-Za-z0-9_-]{24}$/;
const PIN_RE = /^\d{4,8}$/;
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const TEN_MINUTES = 10 * 60 * 1000;
const WRONG_PIN_PER_IP = { limit: 10, windowMs: TEN_MINUTES };
const WRONG_PIN_EVERYONE = { limit: 300, windowMs: TEN_MINUTES };
const CREATE_PER_IP = { limit: 20, windowMs: TEN_MINUTES };
const ADD_PER_IP = { limit: 120, windowMs: TEN_MINUTES };

const OFF = "PIN rooms are turned off";
const NOT_IN_ROOM = "This room has closed, or you are not in it";
const NO_ROOM = "No open room has that PIN";

const newId = () => randomBytes(18).toString("base64url");
const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export async function enabledSettings(): Promise<PinSettings> {
    const settings = await getPinSettings();
    if (!settings.enabled) throw new FileAccessError(OFF, 404);
    return settings;
}

const isLive = (room: PinRoom, now = Date.now()) => room.expiresAt.getTime() > now;

// --- PINs ---

// Digits for a new room while `open` rooms exist
export function pinDigits(open: number): number {
    let digits = MIN_DIGITS;
    while (digits < MAX_DIGITS && open >= 10 ** digits * FILL_SHARE) digits++;
    return digits;
}

function randomPin(digits: number): string {
    return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

const isUniqueClash = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

// --- the member cookie ---

function sign(roomId: string, key: string): string {
    return createHmac("sha256", ENV.JWT_SECRET).update(`pin-room.${roomId}.${key}`).digest("base64url");
}

function readCookie(cookieHeader: string | null | undefined): string | undefined {
    for (const part of (cookieHeader ?? "").split(";")) {
        const eq = part.indexOf("=");
        if (eq > 0 && part.slice(0, eq).trim() === COOKIE) return part.slice(eq + 1).trim();
    }
    return undefined;
}

function cookie(value: string, maxAge: number, secure: boolean): string {
    return [`${COOKIE}=${value}`, "Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])].join("; ");
}

export function clearMemberCookie(secure: boolean): string {
    return cookie("", 0, secure);
}

function memberCookie(room: PinRoom, key: string, secure: boolean): string {
    const maxAge = Math.max(1, Math.ceil((room.expiresAt.getTime() - Date.now()) / 1000));
    return cookie(`${room.id}.${key}.${sign(room.id, key)}`, maxAge, secure);
}

function parseMember(cookieHeader: string | null | undefined): { roomId: string; key: string } | null {
    const [roomId, key, signature, extra] = (readCookie(cookieHeader) ?? "").split(".");
    if (extra !== undefined || !roomId || !key || !signature) return null;
    if (!ROOM_ID_RE.test(roomId) || !KEY_RE.test(key)) return null;

    const expected = Buffer.from(sign(roomId, key));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return { roomId, key };
}

export type Member = { room: PinRoom; keyHash: string; isCreator: boolean };

// The room this browser is in. Throws 404 when the system is off, the room is gone or the cookie is not valid.
export async function findMember(cookieHeader: string | null | undefined): Promise<Member> {
    await enabledSettings();
    const parsed = parseMember(cookieHeader);
    if (!parsed) throw new FileAccessError(NOT_IN_ROOM, 404);
    const room = await prisma.pinRoom.findUnique({ where: { id: parsed.roomId } });
    if (!room || !isLive(room)) throw new FileAccessError(NOT_IN_ROOM, 404);
    const keyHash = hashKey(parsed.key);
    return { room, keyHash, isCreator: keyHash === room.creatorKeyHash };
}

// --- rate limits ---

function assertLimit(rules: { key: string; limit: number; windowMs: number }[], message: string) {
    const wait = retryAfterSeconds(rules);
    if (wait > 0) throw new FileAccessError(`${message} Try again in ${Math.ceil(wait / 60)} minute(s).`, 429);
}

export function assertAddRateLimit(headers: Headers) {
    const rules = [{ key: `pin-add:${getClientIp({ headers })}`, ...ADD_PER_IP }];
    assertLimit(rules, "Too many uploads.");
    recordAttempt(rules);
}

// --- create and join ---

async function usedBytes(): Promise<bigint> {
    const sum = await prisma.pinRoom.aggregate({ _sum: { totalBytes: true } });
    return sum._sum.totalBytes ?? BigInt(0);
}

export type JoinResult = { room: PinRoom; setCookie: string; member: Member };

export async function createRoom(headers: Headers, secure: boolean): Promise<JoinResult> {
    const settings = await enabledSettings();
    const ip = getClientIp({ headers });
    const rules = [{ key: `pin-create:${ip}`, ...CREATE_PER_IP }];
    assertLimit(rules, "Too many new rooms.");

    const now = new Date();
    const mine = await prisma.pinRoom.count({ where: { creatorIp: ip, expiresAt: { gt: now } } });
    if (mine >= settings.roomsPerIp) {
        throw new FileAccessError(`You already have ${mine} open room${mine === 1 ? "" : "s"}. Close one or wait for it to expire.`, 429);
    }
    if (settings.totalMB > 0 && (await usedBytes()) >= BigInt(settings.totalMB) * BigInt(MB)) {
        throw new FileAccessError("PIN rooms are full right now. Try again later.", 507);
    }
    recordAttempt(rules);

    const baseDir = await currentDropBase();
    await ensureDropBase(baseDir);
    const key = randomBytes(32).toString("base64url");
    const open = await prisma.pinRoom.count({ where: { expiresAt: { gt: now } } });

    // The PIN column is unique, so two rooms made at once can never share one
    for (let attempt = 0; attempt < 30; attempt++) {
        // Keep growing if the shorter PINs are mostly taken
        const digits = Math.min(MAX_DIGITS, pinDigits(open) + Math.floor(attempt / 10));
        const pin = randomPin(digits);
        const taken = await prisma.pinRoom.findUnique({ where: { pin } });
        if (taken) {
            if (isLive(taken)) continue;
            await deleteRoom(taken, "expired");
        }
        try {
            const room = await prisma.pinRoom.create({
                data: {
                    id: newId(),
                    pin,
                    baseDir,
                    creatorKeyHash: hashKey(key),
                    creatorIp: ip,
                    expiresAt: new Date(now.getTime() + settings.roomMinutes * 60 * 1000),
                },
            });
            await fs.ensureDir(roomFolder(room));
            invalidateDropBases();
            log(`[PIN] room ${room.id} opened with PIN ${room.pin} (${digits} digits) until ${room.expiresAt.toISOString()}`);
            return { room, setCookie: memberCookie(room, key, secure), member: { room, keyHash: hashKey(key), isCreator: true } };
        } catch (err: unknown) {
            if (!isUniqueClash(err)) throw err;
        }
    }
    throw new FileAccessError("Could not find a free PIN. Try again.", 503);
}

export async function joinRoom(headers: Headers, rawPin: unknown, secure: boolean): Promise<JoinResult> {
    await enabledSettings();
    const ip = getClientIp({ headers });
    const rules = [
        { key: `pin-wrong:${ip}`, ...WRONG_PIN_PER_IP },
        { key: "pin-wrong:everyone", ...WRONG_PIN_EVERYONE },
    ];
    assertLimit(rules, "Too many wrong PINs.");

    const pin = typeof rawPin === "string" ? rawPin.trim() : "";
    const room = PIN_RE.test(pin) ? await prisma.pinRoom.findUnique({ where: { pin } }) : null;
    if (!room || !isLive(room)) {
        recordAttempt(rules);
        throw new FileAccessError(NO_ROOM, 404);
    }
    if (room.locked) {
        recordAttempt(rules);
        throw new FileAccessError("This room is locked. Ask whoever made it to unlock it.", 403);
    }

    const key = randomBytes(32).toString("base64url");
    return { room, setCookie: memberCookie(room, key, secure), member: { room, keyHash: hashKey(key), isCreator: false } };
}

// --- what a member sees ---

export type RoomItemView = {
    id: string;
    kind: "file" | "note";
    name: string | null;
    size: string;
    text: string | null;
    createdAt: Date;
    preview: MediaKind | null;
    canDelete: boolean;
};

export async function roomView(member: Member, knownVersion?: number) {
    const { room } = member;
    const settings = await getPinSettings();
    const base = {
        pin: room.pin,
        version: room.version,
        expiresAt: room.expiresAt,
        locked: room.locked,
        isCreator: member.isCreator,
        usedBytes: String(room.totalBytes),
        itemCount: room.itemCount,
        limits: limitsFor(settings),
    };
    if (knownVersion === room.version) return { ...base, unchanged: true as const };

    const items = await prisma.pinItem.findMany({
        where: { roomId: room.id, completedAt: { not: null } },
        orderBy: { createdAt: "desc" },
    });
    return { ...base, items: items.map((item) => itemView(item, member)) };
}

export function limitsFor(settings: PinSettings) {
    return {
        roomBytes: String(BigInt(settings.roomMB) * BigInt(MB)),
        fileBytes: String(BigInt(Math.min(settings.fileMB, settings.roomMB)) * BigInt(MB)),
        maxItems: settings.maxItems,
        noteChars: NOTE_MAX_CHARS,
        roomMinutes: settings.roomMinutes,
    };
}

function itemView(item: PinItem, member: Member): RoomItemView {
    return {
        id: item.id,
        kind: item.kind === "note" ? "note" : "file",
        name: item.name,
        size: String(item.size),
        text: item.text,
        createdAt: item.createdAt,
        preview: item.kind === "file" && item.name ? mediaTypeOf(item.name)?.kind ?? null : null,
        canDelete: member.isCreator || item.senderKeyHash === member.keyHash,
    };
}

// --- files on disk ---

export function roomFolder(room: Pick<PinRoom, "id" | "baseDir">): string {
    return path.join(room.baseDir, PIN_FOLDER, room.id);
}

export function itemPath(room: Pick<PinRoom, "id" | "baseDir">, itemId: string): string {
    return path.join(roomFolder(room), itemId);
}

// --- adding items ---

// Takes room for one item, or throws with the reason. The counters are checked and
// raised in one UPDATE, so parallel uploads can never go over.
export async function reserveItem(
    member: Member,
    data: { kind: "file" | "note"; bytes: number; name?: string; text?: string; completed: boolean }
): Promise<PinItem> {
    const settings = await enabledSettings();
    const { room } = member;
    const roomCap = BigInt(settings.roomMB) * BigInt(MB);
    const systemCap = settings.totalMB === 0 ? null : BigInt(settings.totalMB) * BigInt(MB);
    const bytes = BigInt(data.bytes);

    if (data.kind === "file") {
        const fileCap = Math.min(settings.fileMB, settings.roomMB) * MB;
        if (data.bytes > fileCap) throw new FileAccessError(`Files can be at most ${Math.min(settings.fileMB, settings.roomMB)} MB here`, 413);
        await assertDiskRoom(roomFolder(room), data.bytes);
    }

    const item = await prisma.$transaction(async (tx) => {
        const count = await tx.$executeRaw`
            UPDATE pin_rooms
            SET total_bytes = total_bytes + ${bytes}, item_count = item_count + 1
            WHERE id = ${room.id}
              AND item_count < ${settings.maxItems}
              AND total_bytes + ${bytes} <= ${roomCap}
              AND (${systemCap} IS NULL OR (SELECT COALESCE(SUM(total_bytes), 0) FROM pin_rooms) + ${bytes} <= ${systemCap})`;
        if (count !== 1) return null;
        return tx.pinItem.create({
            data: {
                id: newId(),
                roomId: room.id,
                kind: data.kind,
                name: data.name ?? null,
                text: data.text ?? null,
                size: bytes,
                senderKeyHash: member.keyHash,
                completedAt: data.completed ? new Date() : null,
            },
        });
    });
    if (item) return item;

    // Say why, from a fresh read
    const now = await prisma.pinRoom.findUnique({ where: { id: room.id } });
    if (!now) throw new FileAccessError(NOT_IN_ROOM, 404);
    if (now.itemCount >= settings.maxItems) throw new FileAccessError(`A room can hold at most ${settings.maxItems} items`, 413);
    if (now.totalBytes + bytes > roomCap) throw new FileAccessError("This room has no space left for that", 413);
    throw new FileAccessError("PIN rooms are full right now. Try again later.", 507);
}

export async function addNote(member: Member, rawText: unknown): Promise<PinItem> {
    if (typeof rawText !== "string") throw new FileAccessError("text is required", 400);
    // Keep line breaks; drop other control characters
    const text = rawText.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
    if (!text) throw new FileAccessError("The note is empty", 400);
    if (Array.from(text).length > NOTE_MAX_CHARS) throw new FileAccessError(`A note can be at most ${NOTE_MAX_CHARS} characters`, 413);

    const item = await reserveItem(member, { kind: "note", bytes: Buffer.byteLength(text), text, completed: true });
    await bump(member.room.id);
    return item;
}

// A file upload finished: the file is already at itemPath(room, item.id)
export async function completeFileItem(roomId: string, itemId: string, name: string): Promise<PinItem> {
    const item = await prisma.pinItem.update({ where: { id: itemId }, data: { completedAt: new Date(), name } });
    await bump(roomId);
    return item;
}

async function bump(roomId: string) {
    await prisma.pinRoom.updateMany({ where: { id: roomId }, data: { version: { increment: 1 } } });
}

// Removes an item and gives its room back. Safe to call when the room is already gone.
export async function removeItem(item: Pick<PinItem, "id" | "roomId" | "size">, baseDir?: string) {
    const { count } = await prisma.pinItem.deleteMany({ where: { id: item.id } });
    if (count === 1) {
        await prisma.$executeRaw`
            UPDATE pin_rooms
            SET total_bytes = MAX(0, total_bytes - ${item.size}), item_count = MAX(0, item_count - 1), version = version + 1
            WHERE id = ${item.roomId}`;
    }
    if (baseDir) await fs.remove(itemPath({ id: item.roomId, baseDir }, item.id)).catch(() => undefined);
}

export async function deleteItem(member: Member, rawId: unknown) {
    const item = await findItem(member, rawId);
    if (!member.isCreator && item.senderKeyHash !== member.keyHash) {
        throw new FileAccessError("Only whoever added this, or made the room, can delete it", 403);
    }
    await removeItem(item, member.room.baseDir);
}

export async function findItem(member: Member, rawId: unknown): Promise<PinItem> {
    const gone = new FileAccessError("This item is not in the room any more", 404);
    if (typeof rawId !== "string" || !ITEM_ID_RE.test(rawId)) throw gone;
    const item = await prisma.pinItem.findUnique({ where: { id: rawId } });
    if (!item || item.roomId !== member.room.id || !item.completedAt) throw gone;
    return item;
}

// The file behind an item, for download or preview
export async function findItemFile(member: Member, rawId: unknown): Promise<{ item: PinItem; filePath: string }> {
    const item = await findItem(member, rawId);
    const filePath = itemPath(member.room, item.id);
    const stat = await fs.stat(filePath).catch(() => null);
    if (item.kind !== "file" || !stat?.isFile()) throw new FileAccessError("This item is not in the room any more", 404);
    return { item, filePath };
}

// --- room controls ---

export async function setLocked(member: Member, locked: unknown) {
    if (!member.isCreator) throw new FileAccessError("Only whoever made the room can lock it", 403);
    if (typeof locked !== "boolean") throw new FileAccessError("locked must be true or false", 400);
    await prisma.pinRoom.update({ where: { id: member.room.id }, data: { locked, version: { increment: 1 } } });
}

export async function closeOwnRoom(member: Member) {
    if (!member.isCreator) throw new FileAccessError("Only whoever made the room can close it", 403);
    await deleteRoom(member.room, "closed by its maker");
}

// Deletes the room's files, then its rows (items go with it); its PIN is free again
export async function deleteRoom(room: PinRoom, why: string) {
    try {
        await fs.remove(roomFolder(room));
    } catch (err: unknown) {
        logerror(`[PIN] could not delete the files of room ${room.id}:`, err);
        return;
    }
    const { count } = await prisma.pinRoom.deleteMany({ where: { id: room.id } });
    if (count === 1) {
        invalidateDropBases();
        log(`[PIN] room ${room.id} (PIN ${room.pin}) deleted: ${why}`);
    }
}

export async function closeAllRooms(why: string) {
    for (const room of await prisma.pinRoom.findMany()) await deleteRoom(room, why);
}

// --- admin ---

export async function listRoomsForAdmin() {
    const rooms = await prisma.pinRoom.findMany({ orderBy: { createdAt: "desc" } });
    return rooms.map((r) => ({
        id: r.id,
        pin: r.pin,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        locked: r.locked,
        usedBytes: String(r.totalBytes),
        itemCount: r.itemCount,
        creatorIp: r.creatorIp,
    }));
}

export async function deleteRoomById(rawId: unknown) {
    if (typeof rawId !== "string" || !ROOM_ID_RE.test(rawId)) throw new FileAccessError("Room not found", 404);
    const room = await prisma.pinRoom.findUnique({ where: { id: rawId } });
    if (!room) throw new FileAccessError("Room not found", 404);
    await deleteRoom(room, "closed by an admin");
}

// --- cleanup ---

export async function sweepPinRooms(now = new Date()) {
    const expired = await prisma.pinRoom.findMany({ where: { expiresAt: { lte: now } } });
    for (const room of expired) await deleteRoom(room, "expired");

    // Room folders whose room is gone (e.g. after a crash)
    const folder = path.join(await currentDropBase(), PIN_FOLDER);
    const names = (await fs.readdir(folder).catch(() => [] as string[])).filter((n) => ROOM_ID_RE.test(n));
    if (names.length === 0) return;
    const live = new Set((await prisma.pinRoom.findMany({ where: { id: { in: names } }, select: { id: true } })).map((r) => r.id));
    for (const name of names) {
        if (live.has(name)) continue;
        const full = path.join(folder, name);
        const stat = await fs.lstat(full).catch(() => null);
        if (!stat?.isDirectory() || now.getTime() - stat.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
        await fs.remove(full).catch((err) => logerror(`[PIN] could not delete leftover folder ${full}:`, err));
    }
}

const globalForSweeper = globalThis as unknown as { pinSweeper?: NodeJS.Timeout };

export function startPinSweeper() {
    if (globalForSweeper.pinSweeper) return;
    const tick = () => sweepPinRooms().catch((err) => logerror("[PIN] sweep failed:", err));
    globalForSweeper.pinSweeper = setInterval(tick, ENV.DROPS_SWEEP_SECONDS * 1000);
    globalForSweeper.pinSweeper.unref();
    tick();
}
