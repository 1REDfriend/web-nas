import fs from "fs-extra";
import type { IncomingMessage } from "http";
import checkDiskSpace from "check-disk-space";
import type { Drop, DropRequest } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log, logerror } from "@/lib/logger";
import { FileAccessError } from "@/lib/security/path-guard";
import { getClientIp, recordAttempt, retryAfterSeconds } from "@/lib/security/rate-limit";
import { DEFAULT_MAX_UPLOAD_BYTES, ParsedUpload, parseUploadForm } from "@/lib/service/upload-service";
import { requestStatus } from "./requests";
import { cleanFileName, cleanSenderName, extensionAllowed } from "./names";
import { getDropLimits } from "./settings";
import { currentDropBase, dropDir, newDropId } from "./locations";
import { ensureDropBase } from "./maintenance";
import { abortDrop, dropFilePath, dropFolderPath, finishDrop } from "./drops";
import { remainingBytes } from "./request-public";

// Taking one file from someone with a drop request link. The file becomes one of
// the owner's drops: it lives in the drop folder, counts against the drop quota and
// is deleted when it expires.
//
// The drop row is created with the request's Content-Length as its size, in one
// transaction that also checks the link's limits and the owner's drop quota (both
// read the drop sizes), so parallel uploads can never go over. The size is set to
// the real file size when the upload finishes, or the row is removed if it fails.

const UPLOAD_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };
// Room for the multipart headers around the file when comparing Content-Length to a file cap
const MULTIPART_SLACK = 64 * 1024;
// Uploads are refused when the drop disk has less free space than this share of its size
const MIN_FREE_SHARE = 0.05;
const HOUR_MS = 60 * 60 * 1000;

export function assertUploadRateLimit(request: { headers: Headers }) {
    const rules = [{ key: `drop-request-upload:${getClientIp(request)}`, ...UPLOAD_LIMIT }];
    const wait = retryAfterSeconds(rules);
    if (wait > 0) throw new FileAccessError(`Too many uploads. Try again in ${Math.ceil(wait / 60)} minute(s).`, 429);
    recordAttempt(rules);
}

// Creates the placeholder drop, or returns null when the link or the quota has no room
async function reserve(request: DropRequest, bytes: number, sender: string | null, ip: string): Promise<Drop | null> {
    const { quotaMB } = await getDropLimits();
    const quota = quotaMB === 0 ? null : quotaMB * 1024 * 1024;
    const baseDir = await currentDropBase();
    await ensureDropBase(baseDir);

    // SQLite takes the write lock at the UPDATE, so the next upload's check sees this drop
    return prisma.$transaction(async (tx) => {
        const count = await tx.$executeRaw`
            UPDATE drop_requests
            SET used_bytes = used_bytes + ${bytes}, file_count = file_count + 1
            WHERE id = ${request.id}
              AND (max_files IS NULL OR file_count < max_files)
              AND (max_total_bytes IS NULL OR used_bytes + ${bytes} <= max_total_bytes)
              AND (${quota} IS NULL OR (SELECT COALESCE(SUM(size), 0) FROM drops WHERE user_id = ${request.userId} AND deleted_at IS NULL) + ${bytes} <= ${quota})`;
        if (count !== 1) return null;

        return tx.drop.create({
            data: {
                id: newDropId(),
                fileName: "file",
                size: BigInt(bytes),
                baseDir,
                userId: request.userId,
                requestId: request.id,
                senderName: sender,
                senderIp: ip,
                // Placeholder until the upload finishes, like any drop upload
                expiresAt: new Date(Date.now() + 24 * HOUR_MS),
            },
        });
    });
}

async function adjust(requestId: string, bytes: number, files: number) {
    await prisma.$executeRaw`
        UPDATE drop_requests
        SET used_bytes = MAX(0, used_bytes + ${bytes}), file_count = MAX(0, file_count + ${files})
        WHERE id = ${requestId}`;
}

async function assertDiskRoom(folder: string, bytes: number) {
    const space = await checkDiskSpace(folder).catch(() => null);
    if (!space || space.size === 0) return;
    if (space.free - bytes < space.size * MIN_FREE_SHARE) {
        throw new FileAccessError("The server is almost out of space and cannot take files right now", 507);
    }
}

export type ReceiveInput = {
    req: IncomingMessage;
    headers: Headers;
    request: DropRequest;
    // Sent in the query string so they can be checked before the body arrives
    senderName: string | null | undefined;
    fileName: string | null | undefined;
};

export type Received = { name: string; size: number };

export async function receiveFile({ req, headers, request, senderName, fileName }: ReceiveInput): Promise<Received> {
    if (requestStatus(request) !== "open") throw new FileAccessError("This link is not taking files right now", 403);

    const sender = cleanSenderName(senderName);
    if (request.requireName && !sender) throw new FileAccessError("Please enter your name", 400);
    if (fileName && !extensionAllowed(cleanFileName(fileName), request.allowedExt)) {
        throw new FileAccessError("This type of file is not accepted here", 415);
    }

    const declared = Number(headers.get("content-length"));
    if (!Number.isInteger(declared) || declared <= 0) throw new FileAccessError("Content-Length is required", 411);

    const fileCap = request.maxFileBytes === null ? DEFAULT_MAX_UPLOAD_BYTES : Number(request.maxFileBytes);
    if (declared > fileCap + MULTIPART_SLACK) throw new FileAccessError("File is larger than this link accepts", 413);
    if (declared > (await remainingBytes(request))) throw new FileAccessError("This link has no room left for a file this large", 413);

    await assertDiskRoom(await currentDropBase(), declared);
    const drop = await reserve(request, declared, sender, getClientIp({ headers }));
    if (!drop) throw new FileAccessError("This link has no room left for a file this large", 413);

    let upload: ParsedUpload | null = null;
    let done = false;
    try {
        await fs.ensureDir(dropDir(drop.baseDir, drop.id));
        // Written straight into the drop's folder, so nothing is copied afterwards
        upload = await parseUploadForm(req, {
            maxFileSize: Math.min(fileCap, declared),
            uploadDir: dropFolderPath(drop),
            sizeMessage: "File is larger than this link accepts",
        });
        const file = upload.file;
        if (!file) throw new FileAccessError('No file uploaded (field "file")', 400);

        const name = cleanFileName(file.originalFilename);
        if (!extensionAllowed(name, request.allowedExt)) throw new FileAccessError("This type of file is not accepted here", 415);

        await fs.move(file.filepath, dropFilePath(drop), { overwrite: true });
        const saved = await finishDrop(drop, { name, lifetimeMs: request.keepHours * HOUR_MS, maxDownloads: null });
        await adjust(request.id, file.size - declared, 0);
        done = true;

        log(`[DROP REQUEST] ${request.id} received drop ${saved.id} "${name}" (${file.size} bytes, until ${saved.expiresAt.toISOString()})`);
        return { name, size: file.size };
    } finally {
        await upload?.cleanup();
        if (!done) {
            // abortDrop removes the folder (and any half-written temp file) and the row
            await abortDrop(drop);
            await adjust(request.id, -declared, -1).catch((err) => logerror("[drop request] could not release space:", err));
        }
    }
}
