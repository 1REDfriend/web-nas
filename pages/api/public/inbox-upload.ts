import { NextApiRequest, NextApiResponse } from 'next';
import { logerror } from '@/lib/logger';
import { FileAccessError } from '@/lib/security/path-guard';
import { findPublicInbox, isUnlocked } from '@/lib/inbox/public';
import { assertUploadRateLimit, receiveFile } from '@/lib/inbox/receive';

// POST /api/public/inbox-upload?id=<id or slug>&name=<file name>&sender=<name>
//   multipart/form-data with one "file"
// No login: anyone with the link may send a file. `name` and `sender` are in the
// query so they are checked before the body arrives; the real file name is checked again.
// Not behind proxy.ts, which would buffer the body in memory.

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

function queryValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const headers = nodeHeaders(req);
    try {
        assertUploadRateLimit({ headers });
        const { inbox, owner } = await findPublicInbox(queryValue(req.query.id));
        if (!isUnlocked(inbox, req.headers.cookie)) throw new FileAccessError('This upload link needs a password', 401);

        const file = await receiveFile({
            req,
            headers,
            inbox,
            owner,
            senderName: queryValue(req.query.sender),
            fileName: queryValue(req.query.name),
        });
        return res.status(201).json({ ok: true, file });
    } catch (err: unknown) {
        // Stop reading a body that will not be used
        if (!req.complete) res.setHeader('Connection', 'close');
        // 507 (disk almost full) is told to the sender; other 5xx are not
        if (err instanceof FileAccessError && (err.status < 500 || err.status === 507)) {
            if (err.status === 429) res.setHeader('Retry-After', '600');
            return res.status(err.status).json({ error: err.message });
        }
        logerror('[inbox upload failed] : ' + err);
        return res.status(500).json({ error: 'Internal Error' });
    }
}
