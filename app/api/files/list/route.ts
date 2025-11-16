import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs-extra';
import path from 'path';
import { logerror } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { UserJwtPayload } from '@/interfaces/userJwtpayload';
import { headers } from 'next/headers';
import { validateUserPaths } from '@/middlewares/pathValidator';
import { FileItem } from '@/components/file-manager/config';
import { ENV } from '@/lib/ENV';

function normalizeFsPath(p: string): string {
    let pathStr = p.trim().replace(/\\/g, '/');

    if (/^[A-Za-z]:\//.test(pathStr)) {
        return pathStr;
    }

    if (!pathStr.startsWith('/')) {
        pathStr = '/' + pathStr;
    }

    return pathStr;
}

type SortOption = 'name' | 'size' | 'date';
type OrderOption = 'asc' | 'desc';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawReqPath = searchParams.get('path');

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

    const ROOT_STORAGE_PATH = ENV.STORAGE_ROOT;
    if (!ROOT_STORAGE_PATH) {
        logerror("[FATAL ERROR] STORAGE_ROOT environment variable is not set.");
        return NextResponse.json(
            { error: "Internal Server Configuration Error" },
            { status: 500 }
        );
    }

    if (!rawReqPath) {
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

            const userPathSet = new Set<string>();
            const duplicateIds: (typeof pathMaps)[number]['id'][] = [];
            const uniquePathMaps: typeof pathMaps = [];

            for (const p of pathMaps) {
                const normalizedRoot = normalizeFsPath(p.rootPath);

                if (userPathSet.has(normalizedRoot)) {
                    duplicateIds.push(p.id);
                } else {
                    userPathSet.add(normalizedRoot);
                    uniquePathMaps.push(p);
                }
            }

            if (duplicateIds.length > 0) {
                await prisma.pathMap.deleteMany({
                    where: {
                        id: { in: duplicateIds }
                    }
                });
            }

            const data = pathMaps.map((p) => ({
                id: p.id,
                name: p.description ?? path.basename(p.rootPath),
                path: normalizeFsPath(p.rootPath),
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

    const reqPath = normalizeFsPath(rawReqPath);

    const validation = await validateUserPaths(userId, reqPath);
    if (validation instanceof NextResponse) {
        return validation;
    }

    try {
        const physicalPath = path.join(ROOT_STORAGE_PATH, reqPath);

        let files = await readdir(physicalPath);

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
                    return await getFileStats(physicalPath, file, reqPath);
                })
            );
        } else {
            const allFilesWithStats = await Promise.all(
                files.map(async (file) => await getFileStats(physicalPath, file, reqPath))
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

        if (err instanceof Error) {
            if ('code' in err && (err as { code: string }).code === 'ENOENT') {
                logerror("[File List Failed] : Path not found. " + err.message);

                await prisma.pathMap.deleteMany({
                    where: { rootPath: reqPath }
                })

                return NextResponse.json(
                    { error: 'Path not found' },
                    { status: 404 }
                );
            }
        }

        logerror("[File List Failed] : " + err);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

async function getFileStats(physicalDirPath: string, fileName: string, virtualDirPath: string) {
    try {
        const physicalFilePath = path.join(physicalDirPath, fileName);
        const stats = await stat(physicalFilePath);

        const isDir = stats.isDirectory();
        const ext = path.extname(fileName);
        const type = isDir ? 'directory' : ext.replace('.', '') || 'file';

        const virtualFilePath = path.join(virtualDirPath, fileName).replace(/\\/g, '/');

        const item: FileItem = {
            id: virtualFilePath,
            name: fileName,
            path: virtualFilePath,
            type,
            size: isDir ? undefined : stats.size,
            updatedAt: stats.mtime.toISOString(),
            folder: virtualDirPath,
            isStarred: false,
        };

        return item;
    } catch (err: unknown) {
        logerror("[File List Failed] : " + err);
        return null
    }
}