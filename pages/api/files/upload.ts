import fs from 'fs-extra';
import formidable, { errors as formidableErrors } from 'formidable';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { log, logerror } from '@/lib/logger';
import { recordRecent } from '@/lib/service/tracked-paths';
import {
    AuthorizedPath,
    FileAccessError,
    authorizeNewEntry,
    getAccessUser,
} from '@/lib/security/path-guard';

export const config = {
    api: {
        bodyParser: false,
    },
};

async function ensureUploadDirExists(currentPath: fs.PathLike) {
    try {
        await fs.promises.mkdir(currentPath, { recursive: true });
    } catch (error: unknown) {
        logerror("[Error creating upload directory] :" + error);
        throw new Error("Internal Error: Could not create directory");
    }
};

async function getUserFromRequest(req: NextApiRequest) {
    // Set by middleware.ts after the JWT has been verified
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

    try {
        const data = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
            const form = formidable({
                keepExtensions: true,
                maxFileSize: 100 * 1024 * 1024 * 1024,
            });

            form.parse(req, (err, fields, files) => {
                if (err) {
                    if (err.code === formidableErrors.maxFieldsSizeExceeded) {
                        return reject({ status: 403, message: "File size exceeds limit" });
                    }
                    logerror("[Upload Failed] : " + err);
                    return reject({ status: 500, message: "Upload Unknow Error" });
                }
                resolve({ fields, files });
            });
        });

        const currentPathField = Array.isArray(data.fields.currentPath)
            ? data.fields.currentPath[0]
            : data.fields.currentPath;

        const uploadedFile = Array.isArray(data.files.file)
            ? data.files.file[0]
            : data.files.file;

        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const tempPath = uploadedFile.filepath;

        if (!currentPathField) {
            await fs.remove(tempPath);
            return res.status(404).json({ error: 'No Path uploaded' });
        }

        let target: AuthorizedPath;
        try {
            // Browsers may send "dir/name" for folder uploads; only the last segment is the file name
            const originalName = (uploadedFile.originalFilename || 'unknown_file').replace(/\\/g, '/');
            target = await authorizeNewEntry(user, currentPathField, path.posix.basename(originalName));
        } catch (err: unknown) {
            await fs.remove(tempPath);
            throw err;
        }

        if (await fs.pathExists(target.physicalPath)) {
            await fs.remove(tempPath);
            return res.status(409).json({ error: 'A file with that name already exists' });
        }

        await ensureUploadDirExists(path.dirname(target.physicalPath));
        await fs.move(tempPath, target.physicalPath);

        log("[UPLOAD] : " + target.virtualPath)
        await recordRecent(user.id, target.virtualPath, "uploaded");

        return res.status(200).json(
            { message: 'File uploaded successfully', filePath: target.virtualPath }
        );

    } catch (error: unknown) {
        if (error instanceof FileAccessError) {
            return res.status(error.status).json({ error: error.message });
        }

        if (typeof error === 'object' && error !== null && 'status' in error && 'message' in error) {

            const customError = error as { status: number; message: string };
            logerror('[Error saving file] :' + customError.message);
            return res.status(customError.status).json({ error: customError.message });
        }

        if (error instanceof Error) {
            logerror('[Error saving file] :' + error.message);
            return res.status(500).json({ error: error.message });
        }

        logerror('[Error saving file] :' + String(error));
        return res.status(500).json({ error: 'An unknown error occurred' });
    }
}
