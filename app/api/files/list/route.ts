import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs-extra';
import path from 'path';
import { sanitizePath } from '@/lib/security';
import { log, logerror } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { UserJwtPayload } from '@/interfaces/userJwtpayload';
import { headers } from 'next/headers';

const ROOT_DIR = process.cwd();

type SortOption = 'name' | 'size' | 'date';
type OrderOption = 'asc' | 'desc';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqPath = searchParams.get('path');

    const headersList = await headers();
    const payloadString = headersList.get('x-user-payload');

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const sortBy = (searchParams.get('sortBy') as SortOption) || 'name';
    const order = (searchParams.get('order') as OrderOption) || 'asc';

    if (!reqPath) {
        try {
            if (!payloadString) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                );
            }

            const userPayload: UserJwtPayload = await JSON.parse(payloadString);
            const userId = userPayload.sub;

            if (!userId) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                );
            }

            const pathMaps = await prisma.pathMap.findMany({
                where: { userId: userId },
                select: {
                    id: true,
                    rootPath: true,
                    description: true
                }
            });

            return NextResponse.json({
                data: pathMaps,
                meta: {
                    totalPaths: pathMaps.length
                }
            });
        } catch (err: unknown) {
            logerror("[PathMap List Failed] : " + err);
            return NextResponse.json(
                { error: 'Failed to fetch authorized paths' },
                { status: 500 }
            );
        }
    }

    try {
        const safePath = sanitizePath(ROOT_DIR, reqPath);
        let files = await readdir(safePath);

        if (search) {
            files = files.filter(file =>
                file.toLowerCase().includes(search.toLowerCase())
            );
        }

        let resultFiles = [];

        if (sortBy === 'name') {
            files.sort((a, b) => {
                return order === 'asc'
                    ? a.localeCompare(b)
                    : b.localeCompare(a);
            });

            const startIndex = (page - 1) * limit;
            const paginatedFiles = files.slice(startIndex, startIndex + limit);

            resultFiles = await Promise.all(paginatedFiles.map(async (file) => {
                return await getFileStats(safePath, file);
            }));
        } else {
            const allFilesWithStats = await Promise.all(
                files.map(async (file) => await getFileStats(safePath, file))
            );

            const validFiles = allFilesWithStats.filter((f): f is NonNullable<typeof f> => f !== null);

            validFiles.sort((a, b) => {
                let comparison = 0;
                if (sortBy === 'size') {
                    comparison = a.size - b.size;
                } else if (sortBy === 'date') {
                    comparison = a.lastModified.getTime() - b.lastModified.getTime();
                }
                return order === 'asc' ? comparison : -comparison;
            });

            const startIndex = (page - 1) * limit;
            resultFiles = validFiles.slice(startIndex, startIndex + limit);
        }

        const finalData = resultFiles.filter(Boolean);

        return NextResponse.json({
            data: finalData,
            meta: {
                totalFiles: files.length,
                currentPage: page,
                itemsPerPage: limit,
                sortBy,
                order
            }
        });
    } catch (err: unknown) {
        logerror("[File List Failed] : " + err);
        return NextResponse.json(
            { error: 'Path not found' },
            { status: 404 }
        );
    }
}

async function getFileStats(dirPath: string, fileName: string) {
    try {
        const filePath = path.join(dirPath, fileName);
        const stats = await stat(filePath);
        return {
            name: fileName,
            isDir: stats.isDirectory(),
            size: stats.size,
            lastModified: stats.mtime,
            metadata: stats,
            path: filePath,
            extension: path.extname(fileName)
        };
    } catch (err: unknown) {
        logerror("[File List Failed] : " + err);
        return null
    }
}