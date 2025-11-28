import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra'
import { logerror } from '@/lib/logger';
import { ENV } from '@/lib/ENV';
import { validateUserPaths } from '@/middlewares/pathValidator';
import { getUserRootPaths, removeInvalidPathMap } from '@/lib/service/user-path-service';
import { normalizeFsPath } from '@/lib/utils/fs-helper';
import { getDirectoryFiles } from '@/lib/service/file-brower-service';
import { xUserPayload } from '@/lib/api/user/x-user-payload';
import { createInternalFolder } from '@/lib/folder/createInternalFolder';
import { cleanTrashItemsByUserId } from '@/lib/utils/trash/trash-clean';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const rawReqPath = searchParams.get('path');

        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const search = searchParams.get('search') || '';
        const sortBy = (searchParams.get('sortBy') as 'name' | 'size' | 'date') || 'name';
        const order = (searchParams.get('order') as 'asc' | 'desc') || 'asc';

        const payloadString = await xUserPayload()

        if (!payloadString) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const userId = payloadString.sub;

        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const ROOT_STORAGE_PATH = ENV.STORAGE_ROOT;
        if (!ROOT_STORAGE_PATH) {
            logerror("[FATAL ERROR] STORAGE_ROOT environment variable is not set.");
            return NextResponse.json({ error: "Internal Server Configuration Error" }, { status: 500 });
        }

        // --- Case 1: List Root Paths (No path param) ---
        if (!rawReqPath) {
            try {
                const data = await getUserRootPaths(userId);
                return NextResponse.json({
                    data,
                    meta: { totalPaths: data.length }
                });
            } catch (err: unknown) {
                logerror("[PathMap List Failed] : " + err);
                return NextResponse.json({ error: 'Failed to fetch authorized paths' }, { status: 500 });
            }
        }

        const reqPath = normalizeFsPath(rawReqPath);

        const validation = await validateUserPaths(userId, reqPath);
        if (validation instanceof NextResponse) return validation;

        const selectedRoot = ENV.STORAGE_ROOT;
        const physicalPath = path.join(selectedRoot, reqPath);

        if (reqPath === "/trash") {
            createInternalFolder(userId, "/trash")
            await cleanTrashItemsByUserId(userId)
        }

        const { data, totalFiles } = await getDirectoryFiles({
            physicalPath,
            reqPath,
            page,
            limit,
            search,
            sortBy,
            order
        });

        return NextResponse.json({
            data,
            meta: {
                totalFiles,
                currentPage: page,
                itemsPerPage: limit,
                sortBy,
                order
            }
        });

    } catch (err: unknown) {
        // --- Error Handling ---
        const { searchParams } = new URL(request.url);
        const rawReqPath = searchParams.get('path');

        logerror("[File List Failed] : " + err);

        if (err instanceof Error) {
            if ('code' in err && (err as { code: string }).code === 'ENOENT') {
                const reqPath = rawReqPath ? normalizeFsPath(rawReqPath) : '';
                logerror("[File List Failed] : Path not found. " + err.message);

                if (rawReqPath) {
                    await removeInvalidPathMap(rawReqPath);

                    if (rawReqPath.startsWith('/')) {
                        await removeInvalidPathMap(rawReqPath.substring(1));
                    }
                }

                if (reqPath && reqPath !== rawReqPath) {
                    await removeInvalidPathMap(reqPath);
                }

                return NextResponse.json({ error: 'Path not found' }, { status: 404 });
            }
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}