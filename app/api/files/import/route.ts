import { UserJwtPayload } from "@/interfaces/userJwtpayload";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import fs from "fs-extra";
import { logerror } from "@/lib/logger";
import { ENV } from "@/lib/ENV";
import path from "path";

export async function POST(request: Request) {
    const body = await request.json();
    const { virtualPath } = body;

    const headersList = await headers();
    const payloadString = headersList.get('x-user-payload');


    if (!virtualPath) {
        return NextResponse.json(
            { error: "No root Path" },
            { status: 400 }
        )
    }

    const ROOT_STORAGE_PATH = ENV.STORAGE_ROOT;

    if (!ROOT_STORAGE_PATH) {
        logerror("[FATAL ERROR] STORAGE_ROOT environment variable is not set.");
        return NextResponse.json(
            { error: "Internal Server Configuration Error" },
            { status: 500 }
        );
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
            where: { id: userId }
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User was not deleted!' },
                { status: 404 }
            );
        }

        if (user.role != "ADMIN") {
            return NextResponse.json(
                { error: 'User has not permission.' },
                { status: 404 }
            );
        }

        const safeSubPath = path.normalize(virtualPath).replace(/^(\.\.[\/\\])+/, '');

        const physicalPath = path.join(ROOT_STORAGE_PATH, safeSubPath);

        try {
            await fs.promises.mkdir(physicalPath, { recursive: true });
        } catch (mkdirError) {
            logerror("[Create Root Path Failed] : " + mkdirError);
            return NextResponse.json(
                { error : "Failed to create directory on server."},
                { status : 500}
            )
        }

        const pathMapExited = await prisma.pathMap.findFirst({
            where: {rootPath : safeSubPath}
        })

        if (pathMapExited) {
            return NextResponse.json(
                {error : "This [" + safeSubPath + "] Was Installed!"},
                { status : 400}
            )
        }

        await prisma.pathMap.create({
            data: {
                rootPath: safeSubPath,
                user: { connect: { id: userId } }
            }
        });

        return NextResponse.json(
            { success: true, rootPath: safeSubPath }
        )
    } catch (err: unknown) {
        logerror("[Import Root Path Failed] : " + err)
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        );
    }
}