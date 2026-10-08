import { UserJwtPayload } from "@/interfaces/userJwtpayload";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import fs from "fs-extra";
import { logerror } from "@/lib/logger";
import { ENV } from "@/lib/ENV";
import { authorizePath, fileAccessErrorResponse } from "@/lib/security/path-guard";

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

        // Same checks as creating a folder there: inside the storage area, not a
        // protected path, and on persistent storage (STORAGE_WRITABLE_PATHS)
        const target = await authorizePath({ id: user.id, role: user.role }, virtualPath, "UPLOAD");
        const safeSubPath = target.virtualPath;

        try {
            await fs.ensureDir(target.physicalPath);
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
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[Import Root Path Failed] : " + err)
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        );
    }
}