import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import archiver from "archiver";
import { authorizePath, fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { prisma } from "@/lib/db";
import { getSafePath } from "@/lib/routes/filesystem/utils";
import { normalizeFsPath } from "@/lib/utils/fs-helper";

export async function POST(request: Request) {
    const body = await request.json()
    const { reqFile, id } = body;

    const { searchParams } = new URL(request.url);
    const reqShare = searchParams.get('share');

    if (reqShare == 'true') {
        if (!id) return NextResponse.json(
            { error: 'Need Id.' },
            { status: 400 }
        )

        const shareLink = await prisma.shareLink.findUnique({
            where: { id }
        })

        if (!shareLink) return NextResponse.json(
            { error: 'Share Path Not Found.' },
            { status: 403 }
        )

        try {
            const physicalPath = getSafePath(shareLink?.rootPath + normalizeFsPath(reqFile))
            const stats = fs.statSync(physicalPath);
            const headers = new Headers();

            if (stats.isFile()) {
                const fileBuffer = fs.readFileSync(physicalPath);
                const filename = path.basename(physicalPath);
                const contentType = mime.lookup(physicalPath) || 'application/octet-stream';

                headers.set('Content-Type', contentType);
                headers.set('Content-Disposition', `attachment; filename="${filename}"`);
                headers.set('Content-Length', stats.size.toString());

                return new NextResponse(fileBuffer, {
                    status: 200,
                    headers: headers,
                });
            }


            if (stats.isDirectory()) {
                const zipFileName = `${path.basename(physicalPath)}.zip`;
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

                        if (!shareLink.recursive) {
                            archive.glob('*', {
                                cwd: physicalPath,
                                nodir: true,
                                matchBase: true,
                                dot: true
                            });
                        }

                        archive.directory(physicalPath, false);
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
            logerror("[Share File Downoad Failed] : " + err);
            if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
                return NextResponse.json(
                    { error: 'Path not found' },
                    { status: 404 }
                );
            }
            return NextResponse.json(
                { error: 'Internal Server Error' },
                { status: 500 }
            );
        }
    }

    const user = await getRequestUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        if (!reqFile) {
            return NextResponse.json(
                { error: "Download Error : please input file" },
                { status: 400 }
            )
        }

        const { physicalPath } = await authorizePath(user, reqFile, "DOWNLOAD", { includeSubtree: true });

        if (!fs.existsSync(physicalPath)) {
            return new NextResponse('File or directory not found',
                { status: 404 }
            );
        }

        const stats = fs.statSync(physicalPath);
        const headers = new Headers();

        if (stats.isFile()) {
            const fileBuffer = fs.readFileSync(physicalPath);
            const filename = path.basename(physicalPath);
            const contentType = mime.lookup(physicalPath) || 'application/octet-stream';

            headers.set('Content-Type', contentType);
            headers.set('Content-Disposition', `attachment; filename="${filename}"`);
            headers.set('Content-Length', stats.size.toString());

            return new NextResponse(fileBuffer, {
                status: 200,
                headers: headers,
            });
        }

        if (stats.isDirectory()) {
            const zipFileName = `${path.basename(physicalPath)}.zip`;
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

                    archive.directory(physicalPath, false);
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
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[File Downoad Failed] : " + err);
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
            return NextResponse.json(
                { error: 'Path not found' },
                { status: 404 }
            );
        }
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}