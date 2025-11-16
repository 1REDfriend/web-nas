import { UserJwtPayload } from "@/interfaces/userJwtpayload";
import { logerror } from "@/lib/logger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {

    const headersList = await headers();
    const payloadString = headersList.get('x-user-payload');

    try {
        if (!payloadString) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userPayload: UserJwtPayload = await JSON.parse(payloadString);
        const userId = userPayload.sub;

        const user = await prisma.user.findUnique({
            where: { id: userId }
        })

        if (user?.role != "ADMIN") {
            return NextResponse.json(
                { error: 'No Permission to access' },
                { status: 401 }
            );
        }

        const pathMap = await prisma.pathMap.findMany({
            select: {
                id: true,
                rootPath: true,
                userId: true
            }
        })

        return NextResponse.json(
            { success: true, pathMap }
        )
    } catch (err: unknown) {
        logerror("[get-import admin failed (GET)] : " + err)
        return NextResponse.json(
            { error: "internal Error : who are you" },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawReqPath = searchParams.get('path');
    const reqPathUserId = searchParams.get('userId')

    const headersList = await headers();
    const payloadString = headersList.get('x-user-payload');

    try {
        if (!payloadString) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        if (!rawReqPath || !reqPathUserId) {
            return NextResponse.json(
                { error: 'No Path added' },
                { status: 400 }
            );
        }

        const userPayload: UserJwtPayload = await JSON.parse(payloadString);
        const userId = userPayload.sub;

        const user = await prisma.user.findUnique({
            where: { id: userId }
        })

        if (user?.role != "ADMIN") {
            return NextResponse.json(
                { error: 'No Permission to access' },
                { status: 401 }
            );
        }

        await prisma.pathMap.deleteMany({
            where: {
                userId: reqPathUserId,
                rootPath: rawReqPath
            }
        })

        return NextResponse.json(
            {message: "Remove pathMap successful" ,success: true}
        )
    } catch (err: unknown) {
        logerror("[get-import admin failed (POST)] : " + err)
        return NextResponse.json(
            { error: "internal Error : who are you" },
            { status: 500 }
        )
    }
}