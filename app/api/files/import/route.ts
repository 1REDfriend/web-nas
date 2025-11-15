import { UserJwtPayload } from "@/interfaces/userJwtpayload";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import fs from "fs-extra";
import { logerror } from "@/lib/logger";

export async function POST(request: Request) {
    const body = await request.json();
    const { rootPath } = body;

    const headersList = await headers();
    const payloadString = headersList.get('x-user-payload');

    if (!rootPath) {
        return NextResponse.json(
            { error: "No root Path" },
            { status: 400 }
        )
    }

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
            where: {id : userId}
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User was deleted!' },
                { status: 404 }
            );
        }

        try {
            await fs.stat(rootPath)
        } catch {
            return NextResponse.json(
                { error : "Path does not exist."},
                { status : 404}
            )
        }

        await prisma.pathMap.create({
            data: {
                rootPath: rootPath,
                user: { connect: { id: userId } }
            }
        });

        return NextResponse.json(
            { success: true , rootPath: rootPath}
        )
    } catch (err : unknown) {
        logerror("[Import Root Path Failed] : " + err)
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        );
    }
}