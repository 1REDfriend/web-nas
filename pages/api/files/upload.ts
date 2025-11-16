import fs from 'fs-extra';
import formidable, { errors as formidableErrors } from 'formidable';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { log, logerror } from '@/lib/logger';
import { ENV } from '@/lib/ENV';

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

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
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

        if (!currentPathField) {
            return res.status(404).json({ error: 'No Path uploaded' });
        }

        const safeSubPath = path.normalize(currentPathField || "").replace(/^(\.\.[\/\\])+/, '');
        const destinationDir = path.join(ENV.STORAGE_ROOT, safeSubPath);
        await ensureUploadDirExists(destinationDir);

        const tempPath = uploadedFile.filepath;
        const originalFilename = uploadedFile.originalFilename || 'unknown_file';

        const newPath = path.join(destinationDir, originalFilename);
        await fs.promises.rename(tempPath, newPath);

        log("[TEMP_PATH] : " + tempPath)
        log("[PATH] : " + newPath)

        const virtualFilePath = path.join(safeSubPath, originalFilename).replace(/\\/g, '/');

        return res.status(200).json(
            { message: 'File uploaded successfully', filePath:  virtualFilePath}
        );

    } catch (error: unknown) {
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