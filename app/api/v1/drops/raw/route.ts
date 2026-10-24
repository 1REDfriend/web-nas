import fs from "fs-extra";
import type { Drop } from "@prisma/client";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { callerLabel } from "@/lib/api/v1/caller";
import { apiErrorFromException, apiOk } from "@/lib/api/v1/response";
import { authenticateUpload, byteLimit } from "@/lib/api/v1/upload";
import { v1AuthErrorResponse } from "@/lib/api/v1/auth";
import { assertCanDrop, assertDeclaredSize, dropOwner, dropUploadLimit, publicOrigin, toApiDrop } from "@/lib/api/v1/drops";
import { abortDrop, beginDrop, dropFilePath, finishDrop, parseDropOptions } from "@/lib/drops/drops";
import { log } from "@/lib/logger";

// PUT /api/v1/drops/raw?name=report.pdf[&expiresIn=24h][&maxDownloads=3]  (scope: drop)
// The request body is the file, e.g. curl -T report.pdf. Answers with the link to hand out.
// Not behind proxy.ts (see src/lib/api/v1/upload.ts): the body is streamed straight to disk.

export async function PUT(request: Request) {
    const auth = await authenticateUpload(request.headers);
    if (!auth.ok) return v1AuthErrorResponse(auth);
    const { caller } = auth;

    let drop: Drop | null = null;
    try {
        assertCanDrop(caller);
        const params = new URL(request.url).searchParams;
        const options = await parseDropOptions({
            name: params.get("name"),
            expiresIn: params.get("expiresIn"),
            maxDownloads: params.get("maxDownloads"),
        });

        const limit = await dropUploadLimit(caller);
        assertDeclaredSize(request.headers, limit);

        drop = await beginDrop(dropOwner(caller), options.name);
        const source = request.body
            ? Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>)
            : Readable.from([]);
        await pipeline(source, byteLimit(limit.maxBytes, limit.message), fs.createWriteStream(dropFilePath(drop)));

        const done = await finishDrop(drop, options);
        log(`[API] ${callerLabel(caller)} drop ${done.id} "${done.fileName}" (${done.size} bytes, until ${done.expiresAt.toISOString()})`);
        return apiOk(toApiDrop(done, publicOrigin(request.headers, request.url)), { status: 201 });
    } catch (err: unknown) {
        if (drop) await abortDrop(drop);
        return apiErrorFromException(err, "drop upload");
    }
}
