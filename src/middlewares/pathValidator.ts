import { prisma } from '@/lib/db';
import { logerror } from '@/lib/logger';
import { NextResponse } from 'next/server';

export type PathValidationResult = {
    ok: boolean;
    failedPath?: string;
};

function toPathArray(paths: string | string[]): string[] {
    if (Array.isArray(paths)) {
        return paths.filter(Boolean);
    }
    return paths ? [paths] : [];
}

function normalizePath(p: string): string {
    let path = p.trim();
    path = path.replace(/\\/g, '/');
    path = path.replace(/\/+/g, '/');
    return path;
}

export async function validateUserPaths(
    userId: string,
    paths: string | string[],
): Promise<NextResponse | PathValidationResult> {
    const pathList = toPathArray(paths);

    if (pathList.length === 0) {
        return { ok: true };
    }

    try {
        const userPathMaps = await prisma.pathMap.findMany({
            where: { userId },
            select: { rootPath: true },
        });

        const allowedRootPaths = userPathMaps.map((p) => normalizePath(p.rootPath));

        for (const rawPath of pathList) {
            const path = normalizePath(rawPath);

            const isPathValid = allowedRootPaths.some((root) => {
                const r = normalizePath(root);
                return path === r || path.startsWith(r.endsWith('/') ? r : r + '/');
            });

            if (!isPathValid) {
                logerror(`[PathValidator] Forbidden path for user ${userId}: ${rawPath}`);
                return NextResponse.json(
                    {
                        message: `Access to path "${rawPath}" is forbidden.`,
                        failedPath: rawPath,
                    },
                    { status: 403 },
                );
            }
        }

        return { ok: true };
    } catch (error) {
        logerror('[PathValidator] Error validating paths: ' + error);
        return NextResponse.json(
            {
                message: 'Database validation error while validating paths.',
                error: String(error),
            },
            { status: 500 },
        );
    }
}

export class PathForbiddenError extends Error {
    failedPath: string;

    constructor(failedPath: string) {
        super(`Access to path "${failedPath}" is forbidden.`);
        this.name = 'PathForbiddenError';
        this.failedPath = failedPath;
    }
}

export async function validateUserPathsOrThrow(
    userId: string,
    paths: string | string[],
): Promise<void> {
    const result = await validateUserPaths(userId, paths);
    if (result instanceof NextResponse) {
        try {
            const errorBody = await result.json();
            if (errorBody.failedPath) {
                throw new PathForbiddenError(errorBody.failedPath);
            } else {
                throw new Error(errorBody.message || 'Validation failed');
            }
        } catch (e) {
            if (e instanceof PathForbiddenError) throw e;
            throw new Error(`Validation failed with status ${result.status}`);
        }
    }
}