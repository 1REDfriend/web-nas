import os from "os";
import path from "path";
import crypto from "crypto";
import fs from "fs-extra";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { boolParam, uploadLimitFor } from "@/lib/api/v1/caller";
import { apiError, apiErrorFromException, apiOk } from "@/lib/api/v1/response";
import { authenticateUpload, byteLimit, preflightUpload, saveForCaller, UploadRequest } from "@/lib/api/v1/upload";
import { v1AuthErrorResponse } from "@/lib/api/v1/auth";
import { normalizeVirtualPath } from "@/lib/security/path-guard";

// PUT /api/v1/files/raw?path=/folder/file.txt[&overwrite=1][&mkdirs=0]  (scope: upload)
// The request body is the file itself, e.g. curl --data-binary @file.
// Not behind proxy.ts (see src/lib/api/v1/upload.ts): the body is streamed straight to disk.

export async function PUT(request: Request) {
    const auth = await authenticateUpload(request.headers);
    if (!auth.ok) return v1AuthErrorResponse(auth);
    const { caller } = auth;

    const tempPath = path.join(os.tmpdir(), `web-nas-put-${crypto.randomBytes(12).toString("hex")}`);
    try {
        const params = new URL(request.url).searchParams;
        const rawPath = params.get("path");
        if (!rawPath) return apiError(400, "BAD_REQUEST", "path is required");

        const virtualPath = normalizeVirtualPath(rawPath);
        const upload: UploadRequest = {
            dir: path.posix.dirname(virtualPath),
            name: path.posix.basename(virtualPath),
            overwrite: boolParam(params.get("overwrite"), false),
            mkdirs: boolParam(params.get("mkdirs"), true),
        };
        if (!upload.name) return apiError(400, "BAD_REQUEST", "path must name a file");

        await preflightUpload(caller, upload);

        const maxBytes = uploadLimitFor(caller);
        const declared = Number(request.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > maxBytes) {
            return apiError(413, "PAYLOAD_TOO_LARGE", "File size exceeds limit");
        }

        const source = request.body
            ? Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>)
            : Readable.from([]);
        await pipeline(source, byteLimit(maxBytes), fs.createWriteStream(tempPath));

        const saved = await saveForCaller(caller, upload, tempPath);
        return apiOk(saved, { status: saved.overwritten ? 200 : 201 });
    } catch (err: unknown) {
        return apiErrorFromException(err, "raw upload");
    } finally {
        await fs.remove(tempPath).catch(() => undefined);
    }
}
