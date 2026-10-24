import type { IncomingMessage } from "http";
import crypto from "crypto";
import path from "path";
import fs from "fs-extra";
import formidable, { errors as formidableErrors } from "formidable";
import { logerror } from "@/lib/logger";
import { AccessUser, AuthorizedPath, FileAccessError, authorizeNewEntry } from "@/lib/security/path-guard";

// Shared by the browser upload route and /api/v1. Parsing streams the file to a temp
// file (never into memory); saving authorizes the target and moves the temp file there.

export const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024 * 1024;
// formidable raises this (not biggerThanMaxFileSize) when the total passes the cap first;
// its TypeScript types leave the code out
const BIGGER_THAN_TOTAL_MAX_FILE_SIZE = (formidableErrors as unknown as Record<string, number>).biggerThanTotalMaxFileSize;

export type ParsedUpload = {
    // First value of a text field, if sent
    field: (name: string) => string | undefined;
    // First file sent under `fileField`, if any
    file: formidable.File | null;
    // Removes every temp file that was not moved into storage
    cleanup: () => Promise<void>;
};

function first<T>(value: T | T[] | undefined): T | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export async function parseUploadForm(
    req: IncomingMessage,
    {
        maxFileSize = DEFAULT_MAX_UPLOAD_BYTES,
        fileField = "file",
        uploadDir,
        sizeMessage = "File size exceeds limit",
    }: {
        maxFileSize?: number;
        fileField?: string;
        // Where temp files are written (default: the OS temp folder); use the final disk to skip a copy
        uploadDir?: string;
        // Message for the 413 when the cap is passed
        sizeMessage?: string;
    } = {}
): Promise<ParsedUpload> {
    const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
        const form = formidable({ keepExtensions: true, maxFileSize, maxTotalFileSize: maxFileSize, ...(uploadDir ? { uploadDir } : {}) });

        form.parse(req, (err, fields, files) => {
            if (err) {
                if (err.code === formidableErrors.biggerThanMaxFileSize || err.code === BIGGER_THAN_TOTAL_MAX_FILE_SIZE) {
                    return reject(new FileAccessError(sizeMessage, 413));
                }
                if (err.code === formidableErrors.maxFieldsSizeExceeded) {
                    return reject(new FileAccessError("File size exceeds limit", 403));
                }
                logerror("[Upload Failed] : " + err);
                return reject(new FileAccessError("Upload Unknow Error", 500));
            }
            resolve({ fields, files });
        });
    });

    const allFiles = Object.values(files).flatMap((list) => list ?? []);

    return {
        field: (name) => first(fields[name]),
        file: first(files[fileField]) ?? null,
        cleanup: async () => {
            await Promise.all(allFiles.map((f) => fs.remove(f.filepath).catch(() => undefined)));
        },
    };
}

export type SaveUploadInput = {
    user: AccessUser;
    // Virtual folder to save into; created if missing
    dir: unknown;
    // Name as the client sent it; only the last path segment is used
    fileName: string | null | undefined;
    tempPath: string;
    // Replace an existing file of the same name (never a folder)
    overwrite?: boolean;
    // Extra check on the authorized target before anything is written (e.g. an API key's folder lock)
    assertTarget?: (target: AuthorizedPath) => void | Promise<void>;
};

// Browsers may send "dir/name" (or "dir\name") for folder uploads
export function uploadFileName(raw: string | null | undefined): string {
    return path.posix.basename((raw || "unknown_file").replace(/\\/g, "/"));
}

// Moves the temp file into storage. The temp file is removed if anything fails.
export async function saveUploadedFile(input: SaveUploadInput): Promise<AuthorizedPath> {
    const { user, dir, fileName, tempPath, overwrite = false, assertTarget } = input;

    try {
        const target = await authorizeNewEntry(user, dir, uploadFileName(fileName));
        await assertTarget?.(target);

        const existing = await fs.stat(target.physicalPath).catch(() => null);
        if (existing?.isDirectory()) {
            throw new FileAccessError("A folder with that name already exists", 409);
        }
        if (existing && !overwrite) {
            throw new FileAccessError("A file with that name already exists", 409);
        }

        const folder = path.dirname(target.physicalPath);
        try {
            await fs.promises.mkdir(folder, { recursive: true });
        } catch (error: unknown) {
            logerror("[Error creating upload directory] :" + error);
            throw new Error("Internal Error: Could not create directory");
        }

        if (!overwrite) {
            // No overwrite flag: fails rather than replace a file that appeared meanwhile
            await fs.move(tempPath, target.physicalPath);
            return target;
        }

        // Stage next to the target, then rename over it, so readers never see a half-written file
        const staged = path.join(folder, `.upload-${crypto.randomBytes(8).toString("hex")}.part`);
        try {
            await fs.move(tempPath, staged);
            await fs.promises.rename(staged, target.physicalPath);
        } catch (err: unknown) {
            await fs.remove(staged).catch(() => undefined);
            throw err;
        }
        return target;
    } catch (err: unknown) {
        await fs.remove(tempPath).catch(() => undefined);
        throw err;
    }
}
