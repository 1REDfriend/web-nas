import fs from 'fs-extra';
import type { Drop } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import { log, logerror } from '@/lib/logger';
import { callerLabel } from '@/lib/api/v1/caller';
import { authenticateUpload } from '@/lib/api/v1/upload';
import { assertCanDrop, assertDeclaredSize, dropOwner, dropUploadLimit, publicOrigin, toApiDrop } from '@/lib/api/v1/drops';
import { abortDrop, beginDrop, dropFilePath, dropFolderPath, finishDrop, parseDropOptions } from '@/lib/drops/drops';
import { ParsedUpload, parseUploadForm } from '@/lib/service/upload-service';
import { FileAccessError } from '@/lib/security/path-guard';

// POST /api/v1/drops/upload  multipart/form-data  (scope: drop)
//   file          the file (required)
//   name          name to show instead of the uploaded one (optional)
//   expiresIn     "30m", "24h", "7d" (optional; default set by the admin)
//   maxDownloads  delete after this many downloads (optional)
// Fields may also be sent in the query string; there they are checked before the body arrives.
// Not behind proxy.ts (see src/lib/api/v1/upload.ts).

export const config = {
    api: {
        bodyParser: false,
    },
};

function nodeHeaders(req: NextApiRequest): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(', '));
    }
    return headers;
}

function sendError(res: NextApiResponse, status: number, code: string, message: string) {
    return res.status(status).json({ ok: false, error: message, code });
}

const CODE_BY_STATUS: Record<number, string> = {
    400: 'BAD_REQUEST', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE',
};

function queryValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendError(res, 405, 'BAD_REQUEST', 'Method Not Allowed');
    }

    const headers = nodeHeaders(req);
    const auth = await authenticateUpload(headers);
    if (!auth.ok) {
        if (auth.retryAfter) res.setHeader('Retry-After', String(auth.retryAfter));
        return sendError(res, auth.status, auth.code, auth.message);
    }
    const { caller } = auth;

    let drop: Drop | null = null;
    let upload: ParsedUpload | null = null;
    try {
        assertCanDrop(caller);
        const fromQuery = {
            name: queryValue(req.query.name),
            expiresIn: queryValue(req.query.expiresIn),
            maxDownloads: queryValue(req.query.maxDownloads),
        };
        await parseDropOptions(fromQuery);

        const limit = await dropUploadLimit(caller);
        assertDeclaredSize(headers, limit);

        drop = await beginDrop(dropOwner(caller), 'file');
        // Written straight into the drop's folder, so nothing is copied afterwards
        upload = await parseUploadForm(req, {
            maxFileSize: limit.maxBytes,
            uploadDir: dropFolderPath(drop),
            sizeMessage: limit.message,
        });
        const file = upload.file;
        if (!file) throw new FileAccessError('No file uploaded (field "file")', 400);

        const options = await parseDropOptions({
            name: fromQuery.name ?? upload.field('name') ?? file.originalFilename,
            expiresIn: fromQuery.expiresIn ?? upload.field('expiresIn'),
            maxDownloads: fromQuery.maxDownloads ?? upload.field('maxDownloads'),
        });
        await fs.move(file.filepath, dropFilePath(drop), { overwrite: true });

        const done = await finishDrop(drop, options);
        log(`[API] ${callerLabel(caller)} drop ${done.id} "${done.fileName}" (${done.size} bytes, until ${done.expiresAt.toISOString()})`);
        return res.status(201).json({ ok: true, data: JSON.parse(JSON.stringify(
            toApiDrop(done, publicOrigin(headers)),
            (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
        )) });
    } catch (err: unknown) {
        if (drop) await abortDrop(drop);
        if (err instanceof FileAccessError && err.status < 500) {
            return sendError(res, err.status, CODE_BY_STATUS[err.status] ?? 'BAD_REQUEST', err.message);
        }
        logerror('[API v1 drop upload] : ' + err);
        return sendError(res, 500, 'INTERNAL', 'Internal error');
    } finally {
        await upload?.cleanup();
    }
}
