import { NextApiRequest, NextApiResponse } from 'next';
import { log, logerror } from '@/lib/logger';
import { recordRecent } from '@/lib/service/tracked-paths';
import { ParsedUpload, parseUploadForm, saveUploadedFile } from '@/lib/service/upload-service';
import { FileAccessError, getAccessUser } from '@/lib/security/path-guard';

export const config = {
    api: {
        bodyParser: false,
    },
};

async function getUserFromRequest(req: NextApiRequest) {
    // Set by proxy.ts after the session has been verified
    const raw = req.headers['x-user-payload'];
    if (typeof raw !== 'string') return null;

    try {
        const payload = JSON.parse(raw) as { sub?: string };
        return getAccessUser(payload.sub);
    } catch {
        return null;
    }
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    const user = await getUserFromRequest(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
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
