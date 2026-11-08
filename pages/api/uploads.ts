import { NextApiRequest, NextApiResponse } from 'next';
import { logerror } from '@/lib/logger';
import { FileAccessError } from '@/lib/security/path-guard';
import { getClientIp } from '@/lib/security/rate-limit';
import { authenticateBrowserUpload } from '@/lib/security/browser-upload-auth';
import { authenticateUpload } from '@/lib/api/v1/upload';
import { publicOrigin, toApiDrop } from '@/lib/api/v1/drops';
import { findPublicRequest, isUnlocked } from '@/lib/drops/request-public';
import { assertUploadRateLimit } from '@/lib/drops/receive';
import { isSecureRequest, senderKeyFor } from '@/lib/drops/request-sharing';
import {
    FinishResult,
    PIECE_MAX_BYTES,
    SessionCaller,
    StartInput,
    UploadOffsetError,
    cancelSession,
    finishSession,
    startDropSession,
    startFileSession,
    startRequestSession,
    writePiece,
} from '@/lib/uploads/sessions';

// Large uploads in pieces, so no single request passes Cloudflare's 100 MB cap.
// See src/lib/uploads/sessions.ts.
//
// POST   /api/uploads?action=start&kind=<file|drop|request>   JSON { size, name, ... }   -> { id, pieceBytes }
//          file:    { dir }                       login session, like /api/files/upload
//          drop:    { expiresIn, maxDownloads }   login session or API key with the drop scope
//          request: { link, sender }              no login; the link's password cookie if it has one
// PUT    /api/uploads?kind=...&id=...&offset=N   raw bytes of one piece    -> { received, size }
//          a 409 carries `received`: send from there
// POST   /api/uploads?action=finish&kind=...&id=...                        -> the finished file
// DELETE /api/uploads?kind=...&id=...                                      cancel
//
// Not behind proxy.ts (it would buffer the pieces in memory): every caller is checked here.

export const config = {
    api: {
        bodyParser: false,
    },
};

const START_BODY_MAX = 16 * 1024;

function nodeHeaders(req: NextApiRequest): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(', '));
    }
    return headers;
}

function queryValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

async function readJson(req: NextApiRequest): Promise<StartInput & { link?: unknown }> {
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > START_BODY_MAX) throw new FileAccessError('Request body is too large', 413);
    }
    try {
        const body = JSON.parse(raw);
        if (body && typeof body === 'object') return body;
    } catch {
        /* handled below */
    }
    throw new FileAccessError('Invalid request body', 400);
}

class AuthError extends Error {
    constructor(public status: number, public body: Record<string, unknown>) {
        super(String(body.error));
    }
}

async function identify(kind: string | undefined, req: NextApiRequest, headers: Headers): Promise<SessionCaller> {
    if (kind === 'file') {
        const auth = await authenticateBrowserUpload(req.headers);
        if (!auth.ok) throw new AuthError(auth.status, auth.body);
        return { kind: 'file', user: auth.user };
    }
    if (kind === 'drop') {
        const auth = await authenticateUpload(headers);
        if (!auth.ok) throw new AuthError(auth.status, { error: auth.message, code: auth.code });
        return { kind: 'drop', caller: auth.caller };
    }
    if (kind === 'request') return { kind: 'request' };
    throw new FileAccessError('kind must be file, drop or request', 400);
}

function finished(result: FinishResult, headers: Headers) {
    if (result.kind === 'file') return { filePath: result.path };
    if (result.kind === 'drop') {
        return JSON.parse(JSON.stringify(toApiDrop(result.drop, publicOrigin(headers)), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    }
    return { file: { name: result.name, size: result.size } };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    const headers = nodeHeaders(req);
    const action = queryValue(req.query.action);
    const kind = queryValue(req.query.kind);
    const id = queryValue(req.query.id);

    try {
        const who = await identify(kind, req, headers);

        if (req.method === 'POST' && action === 'start') {
            const body = await readJson(req);
            let session;
            if (who.kind === 'file') session = await startFileSession(who.user, body);
            else if (who.kind === 'drop') session = await startDropSession(who.caller, body);
            else {
                assertUploadRateLimit({ headers });
                const found = await findPublicRequest(body.link);
                if (!isUnlocked(found.request, req.headers.cookie)) throw new FileAccessError('This link needs a password', 401);
                const key = senderKeyFor(found.request, req.headers.cookie, isSecureRequest(headers));
                session = await startRequestSession(found, body, getClientIp({ headers }), key.hash);
                if (key.setCookie) res.setHeader('Set-Cookie', key.setCookie);
            }
            return res.status(201).json({ ok: true, data: { id: session.id, pieceBytes: PIECE_MAX_BYTES } });
        }

        if (req.method === 'PUT') {
            const data = await writePiece(who, id, queryValue(req.query.offset), req, Number(req.headers['content-length']));
            return res.status(200).json({ ok: true, data });
        }

        if (req.method === 'POST' && action === 'finish') {
            const result = await finishSession(who, id);
            return res.status(201).json({ ok: true, data: finished(result, headers) });
        }

        if (req.method === 'DELETE') {
            await cancelSession(who, id);
            return res.status(200).json({ ok: true, data: { cancelled: true } });
        }

        res.setHeader('Allow', 'POST, PUT, DELETE');
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    } catch (err: unknown) {
        // Stop reading a body that will not be used
        if (!req.complete) res.setHeader('Connection', 'close');
        if (err instanceof AuthError) return res.status(err.status).json({ ok: false, ...err.body });
        if (err instanceof UploadOffsetError) return res.status(409).json({ ok: false, error: err.message, received: err.received });
        if (err instanceof FileAccessError && (err.status < 500 || err.status === 507)) {
            if (err.status === 429) res.setHeader('Retry-After', '600');
            return res.status(err.status).json({ ok: false, error: err.message });
        }
        logerror('[uploads] ' + (action ?? req.method) + ' failed: ' + err);
        return res.status(500).json({ ok: false, error: 'Internal Error' });
    }
}
