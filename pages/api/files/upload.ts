import { NextApiRequest, NextApiResponse } from 'next';
import { log, logerror } from '@/lib/logger';
import { recordRecent } from '@/lib/service/tracked-paths';
import { ParsedUpload, parseUploadForm, saveUploadedFile } from '@/lib/service/upload-service';
import { AccessUser, FileAccessError, getAccessUser } from '@/lib/security/path-guard';
import { sessionTokenFromCookieHeader, verifySessionToken } from '@/lib/security/session';
import { hasBearer } from '@/lib/api/v1/auth';

export const config = {
    api: {
        bodyParser: false,
    },
};

// This route bypasses proxy.ts (it would buffer the whole body in memory), so it
// checks the session itself with the same rules and never trusts x-user-payload.
// Browser sessions only: API keys upload through /api/v1/files/upload.
type UploadAuth =
    | { ok: true; user: AccessUser }
    | { ok: false; status: number; body: { error: string; code?: string } };

async function authenticate(req: NextApiRequest): Promise<UploadAuth> {
    if (hasBearer(req.headers.authorization)) {
        return { ok: false, status: 401, body: { error: 'API keys are not accepted here. Use /api/v1/files/upload.' } };
    }

    const token = sessionTokenFromCookieHeader(req.headers.cookie);
    const session = await verifySessionToken(token);
    if (!session) {
        return { ok: false, status: 401, body: { error: token ? 'Session expired. Please log in again.' : 'Authentication required.' } };
    }
    if (session.mustChangePassword) {
        return { ok: false, status: 403, body: { error: 'Password change required.', code: 'PASSWORD_CHANGE_REQUIRED' } };
    }

    const user = await getAccessUser(session.userId);
    if (!user) return { ok: false, status: 401, body: { error: 'Authentication required.' } };
    return { ok: true, user };
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const auth = await authenticate(req);
    if (!auth.ok) {
        return res.status(auth.status).json(auth.body);
    }
    const { user } = auth;

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    let upload: ParsedUpload | null = null;
    try {
        upload = await parseUploadForm(req);

        const currentPath = upload.field('currentPath');
        const uploadedFile = upload.file;

        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!currentPath) {
            return res.status(404).json({ error: 'No Path uploaded' });
        }

        const target = await saveUploadedFile({
            user,
            dir: currentPath,
            fileName: uploadedFile.originalFilename,
            tempPath: uploadedFile.filepath,
        });

        log("[UPLOAD] : " + target.virtualPath)
        await recordRecent(user.id, target.virtualPath, "uploaded");

        return res.status(200).json(
            { message: 'File uploaded successfully', filePath: target.virtualPath }
        );

    } catch (error: unknown) {
        if (error instanceof FileAccessError) {
            if (error.status >= 500) logerror('[Error saving file] :' + error.message);
            return res.status(error.status).json({ error: error.message });
        }

        if (error instanceof Error) {
            logerror('[Error saving file] :' + error.message);
            return res.status(500).json({ error: error.message });
        }

        logerror('[Error saving file] :' + String(error));
        return res.status(500).json({ error: 'An unknown error occurred' });
    } finally {
        await upload?.cleanup();
    }
}
