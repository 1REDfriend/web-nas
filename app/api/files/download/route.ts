import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import archiver from "archiver";

export async function POST(request: Request) {
    const body = await request.json()
    const { reqFile } = body;

    try {
        if (!reqFile) {
            return NextResponse.json(
                { error: "Download Error : please input file" },
                { status: 400 }
            )
        }
        const reqFilePath = path.join(process.cwd(), reqFile);

        if (!fs.existsSync(reqFilePath)) {
            return new NextResponse('File not found',
                { status: 404 }
            );
        }

        const relativePath = reqFile.startsWith('/') ? reqFile.substring(1) : reqFile;
        const filePath = path.resolve(reqFilePath, relativePath);

        if (!filePath.startsWith(reqFilePath)) {
            logerror(`[File Download Failed] : Forbidden path access attempt: ${reqFile}`);
            return NextResponse.json({ error: 'Forbidden path' }, { status: 403 });
        }

        if (!fs.existsSync(filePath)) {
            return new NextResponse('File or directory not found',
                { status: 404 }
            );
        }

        const stats = fs.statSync(filePath);
        const headers = new Headers();

        if (stats.isFile()) {
            const fileBuffer = fs.readFileSync(filePath);
            const filename = path.basename(filePath);
            const contentType = mime.lookup(filePath) || 'application/octet-stream';

            headers.set('Content-Type', contentType);
            headers.set('Content-Disposition', `attachment; filename="${filename}"`);
            headers.set('Content-Length', stats.size.toString());

            return new NextResponse(fileBuffer, {
                status: 200,
                headers: headers,
            });
        }

        if (stats.isDirectory()) {
            const zipFileName = `${path.basename(filePath)}.zip`;
            const archive = archiver('zip', {
                zlib: { level: 9 },
            });

            const stream = new ReadableStream({
                start(controller) {
                    archive.on('data', (chunk: Buffer) => {
                        controller.enqueue(chunk);
                    });
                    archive.on('end', () => {
                        controller.close();
                    });
                    archive.on('error', (err: Error) => {
                        controller.error(err);
                    });

                    archive.directory(filePath, false);
                    archive.finalize();
                },
            });

            headers.set('Content-Type', 'application/zip');
            headers.set('Content-Disposition', `attachment; filename="${zipFileName}"`);

            return new NextResponse(stream, {
                status: 200,
                headers: headers,
            });
        }

        return new NextResponse('Path is not a file or directory',
            { status: 400 }
        );
    } catch (err: unknown) {
        logerror("[File Downoad Failed] : " + err);
        return NextResponse.json(
            { error: 'Path not found' },
            { status: 404 }
        );
    }
}