import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs-extra';
import path from 'path';
import { sanitizePath } from '@/lib/security';
import { logerror } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { UserJwtPayload } from '@/interfaces/userJwtpayload';
import { headers } from 'next/headers';
import { validateUserPaths } from '@/middlewares/pathValidator';
import { FileItem } from '@/components/file-manager/config';
import { raw } from '@prisma/client/runtime/library';

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

    if (!reqPath) {
        try {
            const pathMaps = await prisma.pathMap.findMany({
                where: { userId: userId },
                select: {
                    id: true,
                    rootPath: true,
                    description: true
                }
            });

            const starPaths = await prisma.starPath.findMany({
                where: { userId: userId },
                select: {
                    rootPath: true,
                }
            })

            const starredSet = new Set(starPaths.map((sp) => sp.rootPath));

            const data = pathMaps.map((p) => ({
                id: p.id,
                name: p.description ?? path.basename(p.rootPath),
                path: p.rootPath,
                type: "directory",
                size: undefined,
                updatedAt: undefined,
                folder: null,
                isStarred: starredSet.has(p.rootPath),
            }));

            return NextResponse.json({
                data,
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
        await validateUserPaths(userId, reqPath);
    } catch (err: unknown) {
        logerror("[List file vaidate Failed] : " + err)
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

            resultFiles = await Promise.all(
                paginatedFiles.map(async (file) => {
                    return await getFileStats(safePath, file, reqPath);
                })
            );
        } else {
            const allFilesWithStats = await Promise.all(
                files.map(async (file) => await getFileStats(safePath, file, reqPath))
            );

            const validFiles = allFilesWithStats.filter((f): f is NonNullable<typeof f> => f !== null);

            validFiles.sort((a, b) => {
                let comparison = 0;
                const aSize = typeof a.size === 'number' ? a.size : 0;
                const bSize = typeof b.size === 'number' ? b.size : 0;

                if (sortBy === 'size') {
                    comparison = aSize - bSize;
                } else if (sortBy === 'date') {
                    const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                    const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                    comparison = aDate - bDate;
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

async function getFileStats(dirPath: string, fileName: string, reqPath: string) {
    try {
        const filePath = path.join(dirPath, fileName);
        const stats = await stat(filePath);

        const isDir = stats.isDirectory();
        const ext = path.extname(fileName);
        const type = isDir ? 'directory' : ext.replace('.', '') || 'file';

        const relativePath = path
            .join('/', path.relative(ROOT_DIR, filePath))
            .replace(/\\/g, '/');

        const item: FileItem = {
            id: relativePath,
            name: fileName,
            path: relativePath,
            type,
            size: isDir ? undefined : stats.size,
            updatedAt: stats.mtime.toISOString(),
            folder: reqPath,
            isStarred: false,
        };

        return item;
    } catch (err: unknown) {
        logerror("[File List Failed] : " + err);
        return null
    }
}