import path from 'path';
import { NextApiRequest, NextApiResponse } from 'next';
import { logerror } from '@/lib/logger';
import { boolParam, uploadLimitFor } from '@/lib/api/v1/caller';
import { authenticateUpload, preflightUpload, saveForCaller, UploadRequest } from '@/lib/api/v1/upload';
import { ParsedUpload, parseUploadForm, uploadFileName } from '@/lib/service/upload-service';
import { FileAccessError } from '@/lib/security/path-guard';

// POST /api/v1/files/upload  multipart/form-data  (scope: upload)
//   file       the file (required)
//   path       folder to save into (required; may also be sent as ?path=)
//   name       file name to use instead of the uploaded one (optional)
//   overwrite  1 = replace an existing file (default 0)
//   mkdirs     0 = the folder must already exist (default 1)
// Values in the query string are checked before the body is received.
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

    const auth = await authenticateUpload(nodeHeaders(req));
    if (!auth.ok) {
        if (auth.retryAfter) res.setHeader('Retry-After', String(auth.retryAfter));
        return sendError(res, auth.status, auth.code, auth.message);
    }
    const { caller } = auth;

    let upload: ParsedUpload | null = null;
    try {
        const queryPath = queryValue(req.query.path);
        const queryName = queryValue(req.query.name);
        if (queryPath && queryName) {
            await preflightUpload(caller, {
                dir: queryPath,
                name: queryName,
                overwrite: boolParam(queryValue(req.query.overwrite), false),
                mkdirs: boolParam(queryValue(req.query.mkdirs), true),
            });
        }

        upload = await parseUploadForm(req, { maxFileSize: uploadLimitFor(caller) });
        const file = upload.file;
        if (!file) return sendError(res, 400, 'BAD_REQUEST', 'No file uploaded (field "file")');

        const request: UploadRequest = {
            dir: queryPath ?? upload.field('path') ?? '',
            name: queryName ?? upload.field('name') ?? uploadFileName(file.originalFilename),
            overwrite: boolParam(queryValue(req.query.overwrite) ?? upload.field('overwrite'), false),
            mkdirs: boolParam(queryValue(req.query.mkdirs) ?? upload.field('mkdirs'), true),
        };
        if (!request.dir) return sendError(res, 400, 'BAD_REQUEST', 'path is required');
        request.name = path.posix.basename(request.name.replace(/\\/g, '/'));

        await preflightUpload(caller, request);
        const saved = await saveForCaller(caller, request, file.filepath);
        return res.status(saved.overwritten ? 200 : 201).json({ ok: true, data: saved });
    } catch (err: unknown) {
        if (err instanceof FileAccessError && err.status < 500) {
            return sendError(res, err.status, CODE_BY_STATUS[err.status] ?? 'BAD_REQUEST', err.message);
        }
        logerror('[API v1 upload] : ' + err);
        return sendError(res, 500, 'INTERNAL', 'Internal error');
    } finally {
        await upload?.cleanup();
    }
}
