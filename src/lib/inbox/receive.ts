import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import type { IncomingMessage } from "http";
import checkDiskSpace from "check-disk-space";
import type { Inbox } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log, logerror } from "@/lib/logger";
import { AccessUser, AuthorizedPath, FileAccessError, authorizeNewEntry, authorizePath, joinVirtual, validateEntryName } from "@/lib/security/path-guard";
import { getClientIp, recordAttempt, retryAfterSeconds } from "@/lib/security/rate-limit";
import { DEFAULT_MAX_UPLOAD_BYTES, ParsedUpload, parseUploadForm } from "@/lib/service/upload-service";
import { inboxStatus } from "./inboxes";
import { cleanFileName, cleanSenderName, extensionAllowed, numberedName, senderFolderName } from "./names";
import { getInboxSettings, quotaBytes } from "./settings";
import { remainingBytes } from "./public";

// Taking one file from someone with an inbox link and saving it as the owner.
//
// Space is reserved in the database before the body is read, in one UPDATE that
// also checks the link's limits and the owner's quota, so parallel uploads can
// never go over. The reservation is the request's Content-Length; it is trimmed
// to the real file size afterwards, or given back if the upload fails.

const UPLOAD_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };
// Room for the multipart headers around the file when comparing Content-Length to a file cap
const MULTIPART_SLACK = 64 * 1024;
// Uploads are refused when the target disk has less free space than this share of its size
const MIN_FREE_SHARE = 0.05;
const PART_PREFIX = ".webnas-part-";

export function assertUploadRateLimit(request: { headers: Headers }) {
    const rules = [{ key: `inbox-upload:${getClientIp(request)}`, ...UPLOAD_LIMIT }];
    const wait = retryAfterSeconds(rules);
    if (wait > 0) throw new FileAccessError(`Too many uploads. Try again in ${Math.ceil(wait / 60)} minute(s).`, 429);
    recordAttempt(rules);
}

async function reserve(inbox: Inbox, bytes: number): Promise<boolean> {
    const quota = quotaBytes(await getInboxSettings());
    const count = await prisma.$executeRaw`
        UPDATE inboxes
        SET used_bytes = used_bytes + ${bytes}, file_count = file_count + 1
        WHERE id = ${inbox.id}
          AND (max_files IS NULL OR file_count < max_files)
          AND (max_total_bytes IS NULL OR used_bytes + ${bytes} <= max_total_bytes)
          AND (${quota} IS NULL OR (SELECT COALESCE(SUM(used_bytes), 0) FROM inboxes WHERE user_id = ${inbox.userId}) + ${bytes} <= ${quota})`;
    return count === 1;
}

async function adjust(inboxId: string, bytes: number, files: number) {
    await prisma.$executeRaw`
        UPDATE inboxes
        SET used_bytes = MAX(0, used_bytes + ${bytes}), file_count = MAX(0, file_count + ${files})
        WHERE id = ${inboxId}`;
}

async function assertDiskRoom(folder: string, bytes: number) {
    const space = await checkDiskSpace(folder).catch(() => null);
    if (!space || space.size === 0) return;
    if (space.free - bytes < space.size * MIN_FREE_SHARE) {
        throw new FileAccessError("The server is almost out of space and cannot take files right now", 507);
    }
}

// Folder the file goes to, created if missing
async function targetDir(owner: AccessUser, inbox: Inbox, sender: string | null): Promise<AuthorizedPath> {
    const virtualDir = inbox.splitBySender && sender
        ? joinVirtual(inbox.targetPath, validateEntryName(senderFolderName(sender)))
        : inbox.targetPath;
    const dir = await authorizePath(owner, virtualDir, "UPLOAD");
    const stat = await fs.stat(dir.physicalPath).catch(() => null);
    if (stat && !stat.isDirectory()) throw new FileAccessError("The upload folder is not available right now", 409);
    await fs.mkdir(dir.physicalPath, { recursive: true });
    return dir;
}

// Moves the temp file in under the first free name: "a.pdf", "a (1).pdf", ...
// An empty file is created exclusively first, so two uploads can never take the same name.
async function place(owner: AccessUser, dir: AuthorizedPath, name: string, tempPath: string): Promise<AuthorizedPath> {
    for (let n = 0; n < 1000; n++) {
        const target = await authorizeNewEntry(owner, dir.virtualPath, numberedName(name, n));
        try {
            await (await fs.promises.open(target.physicalPath, "wx")).close();
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
            throw err;
        }
        try {
            // Same folder, so this is one atomic rename over the placeholder
            await fs.promises.rename(tempPath, target.physicalPath);
        } catch (err: unknown) {
            await fs.remove(target.physicalPath).catch(() => undefined);
            throw err;
        }
        return target;
    }
    throw new FileAccessError("Too many files with that name already", 409);
}

export type ReceiveInput = {
    req: IncomingMessage;
    headers: Headers;
    inbox: Inbox;
    owner: AccessUser;
    // Sent in the query string so it can be checked before the body arrives
    senderName: string | null | undefined;
    fileName: string | null | undefined;
};

export type Received = { name: string; size: number };

export async function receiveFile({ req, headers, inbox, owner, senderName, fileName }: ReceiveInput): Promise<Received> {
    if (inboxStatus(inbox) !== "open") throw new FileAccessError("This upload link is not taking files right now", 403);

    const sender = cleanSenderName(senderName);
    if (inbox.requireName && !sender) throw new FileAccessError("Please enter your name", 400);
    if (fileName && !extensionAllowed(cleanFileName(fileName), inbox.allowedExt)) {
        throw new FileAccessError("This type of file is not accepted here", 415);
    }

    const declared = Number(headers.get("content-length"));
    if (!Number.isInteger(declared) || declared <= 0) throw new FileAccessError("Content-Length is required", 411);

    const fileCap = inbox.maxFileBytes === null ? DEFAULT_MAX_UPLOAD_BYTES : Number(inbox.maxFileBytes);
    const left = await remainingBytes(inbox);
    if (declared > fileCap + MULTIPART_SLACK) throw new FileAccessError("File is larger than this link accepts", 413);
    if (declared > left) throw new FileAccessError("This link has no room left for a file this large", 413);

    const dir = await targetDir(owner, inbox, sender);
    await assertDiskRoom(dir.physicalPath, declared);

    if (!(await reserve(inbox, declared))) {
        throw new FileAccessError("This link has no room left for a file this large", 413);
    }

    let reserved = declared;
    let upload: ParsedUpload | null = null;
    // Temp files are tracked by name: a body cut off half way leaves one behind before parsing returns
    const parts: string[] = [];
    try {
        upload = await parseUploadForm(req, {
            maxFileSize: Math.min(fileCap, declared),
            // Written next to its final place so nothing is copied across disks afterwards
            uploadDir: dir.physicalPath,
            tempName: () => {
                const part = PART_PREFIX + crypto.randomBytes(8).toString("hex");
                parts.push(path.join(dir.physicalPath, part));
                return part;
            },
            sizeMessage: "File is larger than this link accepts",
        });
        const file = upload.file;
        if (!file) throw new FileAccessError('No file uploaded (field "file")', 400);

        const name = cleanFileName(file.originalFilename);
        if (!extensionAllowed(name, inbox.allowedExt)) throw new FileAccessError("This type of file is not accepted here", 415);

        const target = await place(owner, dir, name, file.filepath);
        const savedName = path.posix.basename(target.virtualPath);

        await adjust(inbox.id, file.size - reserved, 0);
        reserved = 0;
        await prisma.inboxUpload.create({
            data: {
                inboxId: inbox.id,
                fileName: savedName,
                path: target.virtualPath,
                size: BigInt(file.size),
                senderName: sender,
                senderIp: getClientIp({ headers }),
            },
        });
        log(`[INBOX] ${inbox.id} received "${savedName}" (${file.size} bytes) into ${target.virtualPath}`);
        return { name: savedName, size: file.size };
    } finally {
        if (reserved) await adjust(inbox.id, -reserved, -1).catch((err) => logerror("[inbox] could not release space:", err));
        await upload?.cleanup();
        await Promise.all(parts.map((p) => fs.remove(p).catch(() => undefined)));
    }
}

const IP_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

// Run by the drop sweeper: sender IPs are only kept for a while
export async function forgetOldSenderIps(now = new Date()) {
    await prisma.inboxUpload.updateMany({
        where: { senderIp: { not: null }, createdAt: { lt: new Date(now.getTime() - IP_KEEP_MS) } },
        data: { senderIp: null },
    });
}
