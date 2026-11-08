import path from "path";
import fs from "fs-extra";
import { randomBytes } from "crypto";
import { pipeline } from "stream/promises";
import type { IncomingMessage } from "http";
import type { Drop, UploadSession } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ENV } from "@/lib/ENV";
import { log, logerror } from "@/lib/logger";
import { AccessUser, FileAccessError, authorizeNewEntry } from "@/lib/security/path-guard";
import { recordRecent } from "@/lib/service/tracked-paths";
import { saveUploadedFile, uploadFileName } from "@/lib/service/upload-service";
import { byteLimit } from "@/lib/api/v1/upload";
import { ApiCaller } from "@/lib/api/v1/caller";
import { assertCanDrop, dropOwner, dropUploadLimit } from "@/lib/api/v1/drops";
import { abortDrop, beginDrop, dropFilePath, finishDrop, parseDropOptions } from "@/lib/drops/drops";
import { currentDropBase } from "@/lib/drops/locations";
import { ensureDropBase } from "@/lib/drops/maintenance";
import { cleanFileName } from "@/lib/drops/names";
import { assertDiskRoom, cancelReceive, completeReceive, prepareReceive } from "@/lib/drops/receive";
import type { PublicRequest } from "@/lib/drops/request-public";
import { Member, assertAddRateLimit, completeFileItem, itemPath, removeItem, reserveItem } from "@/lib/pin/rooms";

// Large uploads sent in pieces. Cloudflare's free plan refuses any request body over
// 100 MB, so the browser sends a big file as several smaller requests:
//
//   start   every check that does not need the bytes (permission, folder, quota, link
//           limits); reserves the room and makes an empty temp file
//   piece   appends one piece at the given offset (resending a piece is safe)
//   finish  checks the size and puts the file in place, like a one-request upload
//   cancel  undoes the start
//
// Four kinds share this: "file" (into the user's own folders), "drop" (a new drop),
// "request" (a file someone sends through a drop request link) and "pin" (a file put
// into a PIN room; small files come this way too, as a single piece).

const MB = 1024 * 1024;
export const PIECE_MAX_BYTES = 64 * MB;
// A session with no new piece for this long is cancelled by the sweeper
export const SESSION_IDLE_MS = 60 * 60 * 1000;
const MAX_OPEN_PER_USER = 20;
const PLACEHOLDER_MS = 24 * 60 * 60 * 1000;
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{24}$/;
// Temp files for "file" uploads live beside the drops: off the file manager, on the big disk
const TEMP_FOLDER = ".webnas-uploads";

export type SessionKind = "file" | "drop" | "request" | "pin";

type FileMeta = { dir: string; name: string };
type DropMeta = { dropId: string; keyId: string | null; name: string; lifetimeMs: number; maxDownloads: number | null };
type RequestMeta = { dropId: string; requestId: string; keepHours: number; name: string };
type PinMeta = { roomId: string; baseDir: string; itemId: string; name: string };

// Who is calling: a browser session (file), a v1 caller (drop), nobody (request)
// or a member of a PIN room (pin)
export type SessionCaller =
    | { kind: "file"; user: AccessUser }
    | { kind: "drop"; caller: ApiCaller }
    | { kind: "request" }
    | { kind: "pin"; member: Member };

const busy = new Set<string>();

async function exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    if (busy.has(id)) throw new FileAccessError("This upload is busy with another piece; try again", 409);
    busy.add(id);
    try {
        return await work();
    } finally {
        busy.delete(id);
    }
}

function totalSize(raw: unknown): number {
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1) {
        throw new FileAccessError("size must be the file size in bytes", 400);
    }
    return raw;
}

async function assertRoomForSessions(userId: string) {
    if ((await prisma.uploadSession.count({ where: { userId } })) >= MAX_OPEN_PER_USER) {
        throw new FileAccessError(`At most ${MAX_OPEN_PER_USER} uploads can be in progress at once`, 429);
    }
}

async function tempFolder(): Promise<string> {
    const base = await currentDropBase();
    await ensureDropBase(base);
    const folder = path.join(base, TEMP_FOLDER);
    await fs.ensureDir(folder);
    return folder;
}

const newId = () => randomBytes(18).toString("base64url");

async function createSession(id: string, kind: SessionKind, userId: string, size: number, tempPath: string, meta: object) {
    await fs.ensureFile(tempPath);
    return prisma.uploadSession.create({
        data: { id, kind, userId, size: BigInt(size), tempPath, meta: JSON.stringify(meta) },
    });
}

// --- start ---

export type StartInput = { size?: unknown; name?: unknown; dir?: unknown; expiresIn?: unknown; maxDownloads?: unknown; sender?: unknown };

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

export async function startFileSession(user: AccessUser, input: StartInput): Promise<UploadSession> {
    const size = totalSize(input.size);
    const name = uploadFileName(text(input.name));
    if (typeof input.dir !== "string") throw new FileAccessError("dir is required", 400);

    // Same checks saveUploadedFile makes, so a refused upload is refused before any bytes
    const target = await authorizeNewEntry(user, input.dir, name);
    const existing = await fs.stat(target.physicalPath).catch(() => null);
    if (existing?.isDirectory()) throw new FileAccessError("A folder with that name already exists", 409);
    if (existing) throw new FileAccessError("A file with that name already exists", 409);
    await assertRoomForSessions(user.id);

    const folder = await tempFolder();
    await assertDiskRoom(folder, size);
    const id = newId();
    return createSession(id, "file", user.id, size, path.join(folder, `${id}.part`), { dir: input.dir, name } satisfies FileMeta);
}

export async function startDropSession(caller: ApiCaller, input: StartInput): Promise<UploadSession> {
    assertCanDrop(caller);
    const size = totalSize(input.size);
    const options = await parseDropOptions({ name: text(input.name), expiresIn: text(input.expiresIn), maxDownloads: text(input.maxDownloads) });
    const limit = await dropUploadLimit(caller);
    if (size > limit.maxBytes) throw new FileAccessError(limit.message, 413);
    await assertRoomForSessions(caller.user.id);

    let drop: Drop | null = await beginDrop(dropOwner(caller), "file");
    try {
        // The announced size counts against the quota until the upload finishes or is cancelled
        drop = await prisma.drop.update({ where: { id: drop.id }, data: { size: BigInt(size) } });
        await assertDiskRoom(drop.baseDir, size);
        const meta: DropMeta = { dropId: drop.id, keyId: caller.keyId, ...options };
        const session = await createSession(newId(), "drop", caller.user.id, size, `${dropFilePath(drop)}.part`, meta);
        drop = null;
        return session;
    } finally {
        if (drop) await abortDrop(drop);
    }
}

export async function startRequestSession(found: PublicRequest, input: StartInput, ip: string, senderKeyHash: string | null): Promise<UploadSession> {
    const { request } = found;
    const size = totalSize(input.size);
    const name = cleanFileName(text(input.name));

    const { drop } = await prepareReceive(request, { senderName: input.sender, fileName: name, bytes: size, ip, senderKeyHash });
    try {
        const meta: RequestMeta = { dropId: drop.id, requestId: request.id, keepHours: request.keepHours, name };
        return await createSession(newId(), "request", request.userId, size, `${dropFilePath(drop)}.part`, meta);
    } catch (err: unknown) {
        await cancelReceive(drop, request.id, size);
        throw err;
    }
}

export async function startPinSession(member: Member, input: StartInput, headers: Headers): Promise<UploadSession> {
    const size = totalSize(input.size);
    const name = cleanFileName(text(input.name));
    assertAddRateLimit(headers);
    const owner = `pin:${member.room.id}`;
    await assertRoomForSessions(owner);

    const item = await reserveItem(member, { kind: "file", bytes: size, name, completed: false });
    try {
        const meta: PinMeta = { roomId: member.room.id, baseDir: member.room.baseDir, itemId: item.id, name };
        return await createSession(newId(), "pin", owner, size, `${itemPath(member.room, item.id)}.part`, meta);
    } catch (err: unknown) {
        await removeItem(item, member.room.baseDir);
        throw err;
    }
}

// --- the caller must be the one who started it ---

async function findSession(id: unknown, who: SessionCaller): Promise<UploadSession> {
    const gone = new FileAccessError("Upload not found; it may have expired", 404);
    if (typeof id !== "string" || !SESSION_ID_RE.test(id)) throw gone;
    const session = await prisma.uploadSession.findUnique({ where: { id } });
    if (!session || session.kind !== who.kind) throw gone;

    if (who.kind === "file" && session.userId !== who.user.id) throw gone;
    if (who.kind === "drop") {
        const meta = JSON.parse(session.meta) as DropMeta;
        if (session.userId !== who.caller.user.id || meta.keyId !== who.caller.keyId) throw gone;
    }
    // Any member of the room may carry on an upload into it; nobody else can
    if (who.kind === "pin" && (JSON.parse(session.meta) as PinMeta).roomId !== who.member.room.id) throw gone;
    return session;
}

// --- pieces ---

export async function writePiece(who: SessionCaller, id: unknown, rawOffset: unknown, req: IncomingMessage, contentLength: number) {
    const session = await findSession(id, who);
    return exclusive(session.id, async () => {
        const current = await prisma.uploadSession.findUnique({ where: { id: session.id } });
        if (!current) throw new FileAccessError("Upload not found; it may have expired", 404);

        const received = Number(current.received);
        const offset = Number(rawOffset);
        if (!Number.isSafeInteger(offset) || offset !== received) {
            throw new UploadOffsetError(received);
        }
        if (!Number.isSafeInteger(contentLength) || contentLength < 1) throw new FileAccessError("Content-Length is required", 411);
        if (contentLength > PIECE_MAX_BYTES) throw new FileAccessError(`A piece can be at most ${PIECE_MAX_BYTES / MB} MB`, 413);
        if (received + contentLength > Number(current.size)) throw new FileAccessError("More bytes than the size given at the start", 413);

        let written = 0;
        try {
            const counter = byteLimit(contentLength, "Piece is longer than its Content-Length");
            counter.on("data", (chunk: Buffer) => {
                written += chunk.length;
            });
            await pipeline(req, counter, fs.createWriteStream(current.tempPath, { flags: "r+", start: received }));
            if (written !== contentLength) throw new FileAccessError("The piece arrived incomplete; send it again", 400);
        } catch (err: unknown) {
            // Drop whatever part of this piece was written, so it can be sent again
            await fs.truncate(current.tempPath, received).catch(() => undefined);
            throw err;
        }

        const updated = await prisma.uploadSession.update({
            where: { id: current.id },
            data: { received: BigInt(received + contentLength) },
        });
        if (current.kind === "drop" || current.kind === "request") {
            // Keep the placeholder drop from looking abandoned while pieces keep coming
            const { dropId } = JSON.parse(current.meta) as DropMeta | RequestMeta;
            await prisma.drop.updateMany({ where: { id: dropId, completedAt: null }, data: { expiresAt: new Date(Date.now() + PLACEHOLDER_MS) } });
        }
        return { received: Number(updated.received), size: Number(updated.size) };
    });
}

export class UploadOffsetError extends FileAccessError {
    constructor(public received: number) {
        super(`Expected the piece at offset ${received}`, 409);
    }
}

// --- finish and cancel ---

export type FinishResult =
    | { kind: "file"; path: string }
    | { kind: "drop"; drop: Drop }
    | { kind: "request"; name: string; size: number }
    | { kind: "pin"; id: string; name: string; size: number };

export async function finishSession(who: SessionCaller, id: unknown): Promise<FinishResult> {
    const session = await findSession(id, who);
    return exclusive(session.id, async () => {
        const current = (await prisma.uploadSession.findUnique({ where: { id: session.id } })) ?? session;
        const size = Number(current.size);
        const onDisk = (await fs.stat(current.tempPath).catch(() => null))?.size;
        if (Number(current.received) !== size || onDisk !== size) {
            throw new FileAccessError(`Only ${current.received} of ${size} bytes have arrived`, 409);
        }

        // From here the session is used up: on failure everything is undone
        let result: FinishResult | null = null;
        try {
            result = await finishKind(current, who);
            return result;
        } finally {
            await prisma.uploadSession.deleteMany({ where: { id: current.id } });
            if (!result) await undo(current);
        }
    });
}

async function finishKind(session: UploadSession, who: SessionCaller): Promise<FinishResult> {
    if (session.kind === "file" && who.kind === "file") {
        const meta = JSON.parse(session.meta) as FileMeta;
        const target = await saveUploadedFile({ user: who.user, dir: meta.dir, fileName: meta.name, tempPath: session.tempPath });
        log(`[UPLOAD] : ${target.virtualPath} (${session.size} bytes, in pieces)`);
        await recordRecent(who.user.id, target.virtualPath, "uploaded");
        return { kind: "file", path: target.virtualPath };
    }

    if (session.kind === "pin") {
        const m = JSON.parse(session.meta) as PinMeta;
        const item = await prisma.pinItem.findUnique({ where: { id: m.itemId } });
        if (!item || item.completedAt) throw new FileAccessError("The room has closed", 404);
        await fs.promises.rename(session.tempPath, itemPath({ id: m.roomId, baseDir: m.baseDir }, item.id));
        const done = await completeFileItem(m.roomId, item.id, m.name);
        log(`[PIN] room ${m.roomId} received "${m.name}" (${session.size} bytes)`);
        return { kind: "pin", id: done.id, name: m.name, size: Number(done.size) };
    }

    const meta = JSON.parse(session.meta) as DropMeta | RequestMeta;
    const drop = await prisma.drop.findUnique({ where: { id: meta.dropId } });
    if (!drop || drop.deletedAt || drop.completedAt) throw new FileAccessError("Upload not found; it may have expired", 404);
    await fs.promises.rename(session.tempPath, dropFilePath(drop));

    if (session.kind === "drop") {
        const m = meta as DropMeta;
        const done = await finishDrop(drop, { name: m.name, lifetimeMs: m.lifetimeMs, maxDownloads: m.maxDownloads });
        log(`[DROP] ${done.id} "${done.fileName}" (${done.size} bytes, in pieces, until ${done.expiresAt.toISOString()})`);
        return { kind: "drop", drop: done };
    }

    const m = meta as RequestMeta;
    const done = await completeReceive(drop, m.requestId, m.keepHours, m.name, Number(session.size));
    return { kind: "request", name: m.name, size: Number(done.size) };
}

// Frees what the start reserved and removes what was written
async function undo(session: UploadSession) {
    try {
        if (session.kind === "file") {
            await fs.remove(session.tempPath);
            return;
        }
        if (session.kind === "pin") {
            const m = JSON.parse(session.meta) as PinMeta;
            await fs.remove(session.tempPath);
            const item = await prisma.pinItem.findUnique({ where: { id: m.itemId } });
            if (item && !item.completedAt) await removeItem(item, m.baseDir);
            return;
        }
        const meta = JSON.parse(session.meta) as DropMeta | RequestMeta;
        const drop = await prisma.drop.findUnique({ where: { id: meta.dropId } });
        if (!drop || drop.completedAt) {
            await fs.remove(session.tempPath);
            return;
        }
        if (session.kind === "request") await cancelReceive(drop, (meta as RequestMeta).requestId, Number(session.size));
        else await abortDrop(drop);
    } catch (err: unknown) {
        logerror(`[uploads] could not clean up upload ${session.id}:`, err);
    }
}

export async function cancelSession(who: SessionCaller, id: unknown) {
    const session = await findSession(id, who);
    await exclusive(session.id, async () => {
        const { count } = await prisma.uploadSession.deleteMany({ where: { id: session.id } });
        if (count === 1) await undo(session);
    });
}

// --- cleanup ---

export async function sweepUploadSessions(now = new Date()) {
    const idle = await prisma.uploadSession.findMany({ where: { updatedAt: { lt: new Date(now.getTime() - SESSION_IDLE_MS) } } });
    for (const session of idle) {
        if (busy.has(session.id)) continue;
        const { count } = await prisma.uploadSession.deleteMany({ where: { id: session.id, updatedAt: session.updatedAt } });
        if (count === 1) {
            await undo(session);
            log(`[uploads] cancelled idle upload ${session.id} (${session.received} of ${session.size} bytes)`);
        }
    }

    // Temp files no session owns any more (e.g. after a crash)
    const folder = path.join(await currentDropBase(), TEMP_FOLDER);
    const names = await fs.readdir(folder).catch(() => [] as string[]);
    const ids = names.filter((n) => n.endsWith(".part")).map((n) => n.slice(0, -".part".length));
    if (ids.length === 0) return;
    const live = new Set((await prisma.uploadSession.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((s) => s.id));
    for (const id of ids) {
        if (live.has(id)) continue;
        const full = path.join(folder, `${id}.part`);
        const stat = await fs.stat(full).catch(() => null);
        if (stat && now.getTime() - stat.mtimeMs > SESSION_IDLE_MS) await fs.remove(full).catch(() => undefined);
    }
}

const globalForSweeper = globalThis as unknown as { uploadSweeper?: NodeJS.Timeout };

export function startUploadSweeper() {
    if (globalForSweeper.uploadSweeper) return;
    const tick = () => sweepUploadSessions().catch((err) => logerror("[uploads] sweep failed:", err));
    globalForSweeper.uploadSweeper = setInterval(tick, ENV.DROPS_SWEEP_SECONDS * 1000);
    globalForSweeper.uploadSweeper.unref();
    tick();
}
