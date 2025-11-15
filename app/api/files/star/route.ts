import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logerror } from '@/lib/logger';
import { headers } from 'next/headers';
import { UserJwtPayload } from '@/interfaces/userJwtpayload';
import { validateUserPaths } from '@/middlewares/pathValidator';

export async function POST(request: Request) {
    const body = await request.json();
    const { path: reqPath } = body;

    if (typeof reqPath !== 'string' || !reqPath) {
        return NextResponse.json(
            { error: 'Invalid request: "path" must be a non-empty string' },
            { status: 400 }
        );
    }

    try {
        const headersList = await headers();
        const payloadString = headersList.get('x-user-payload');

        if (!payloadString) {
            logerror("[API_STAR_TOGGLE] : Missing 'x-user-payload' header.");
            return NextResponse.json(
                { error: 'Unauthorized: Missing user payload' },
                { status: 401 }
            );
        }

        let userPayload: UserJwtPayload;
        try {
            userPayload = JSON.parse(payloadString);
        } catch {
            logerror("[API_STAR_TOGGLE] : Failed to parse 'x-user-payload' header.");
            return NextResponse.json(
                { error: 'Internal Server Error: Invalid payload format' },
                { status: 500 }
            );
        }

        const userId = userPayload.sub;

        if (!userId || typeof userId !== 'string') {
            return NextResponse.json(
                { error: 'Unauthorized: Invalid user ID in payload' },
                { status: 401 }
            );
        }

        await validateUserPaths(userId, reqPath)

        const compositeId = {
            userId: userId,
            rootPath: reqPath,
        };

        const existingStar = await prisma.starPath.findUnique({
            where: { idx_user_path_unique: compositeId },
        });

        if (existingStar) {
            await prisma.starPath.delete({
                where: { id: existingStar.id },
            });
            return NextResponse.json(
                { success: true, isStarred: false }
            );
        } else {
            await prisma.starPath.create({
                data: {
                    userId: userId,
                    rootPath: reqPath,
                },
            });
            return NextResponse.json(
                { success: true, isStarred: true }
            );
        }
    } catch (err: unknown) {
        logerror("[Star File Failed] : " + err);
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        );
    }
}