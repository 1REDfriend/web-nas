import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fileExitsInDir, fileExitsUser } from "@/lib/routes/filesystem/fileExits";
import { fileType } from "@/lib/routes/filesystem/fileType";
import { getSafePath } from "@/lib/routes/filesystem/utils";

export async function GET() {
    const userPayload = await xUserPayload();

    if (!userPayload) {
        return NextResponse.json(
            { error: "Unable to verify identity" },
            { status: 401 }
        )
    }

    const userId = userPayload.sub;

    try {


        const rawShares = await prisma.shareLink.findMany({
            where: { userId }
        });

        const userShare = await Promise.all(rawShares.map(async (shareLink) => {
            let status = 'Active';
            const now = new Date();

            if (shareLink.expireAt && now > shareLink.expireAt) {
                status = 'Expire';
            } else {
                const pathExists = (await fileExitsUser(shareLink.userId, shareLink.rootPath)) &&
                    (await fileExitsInDir(shareLink.rootPath));

                if (!pathExists) {
                    status = 'Invalid Path';
                }
            }

            const { userId, ...rest } = shareLink;

            void userId

            const type = await fileType(getSafePath(shareLink.rootPath))
            const url = `/api/user/share/id/${shareLink.id}`

            return {
                ...rest,
                name: shareLink.rootPath,
                type,
                url,
                status: status
            };
        }));

        return NextResponse.json(
            { share: userShare }
        )
    } catch (err: unknown) {
        logerror("[user share get failed] :", err)
        return NextResponse.json(
            { error: "Internal Error" },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    const body = await request.json();
    const { path: reqPath , expireAt, recursive} = body

    if (!reqPath) {
        return NextResponse.json(
            { error: 'Invalid Path' },
            { status: 400 }
        )
    }

    const userPayload = await xUserPayload();

    if (!userPayload) {
        return NextResponse.json(
            { error: "Unable to verify identity" },
            { status: 401 }
        )
    }

    const userId = userPayload.sub;

    try {
        if (!await fileExitsUser(userId, reqPath)) {
            return NextResponse.json(
                { error: 'Invalid Path not allowed' },
                { status: 400 }
            )
        }

        const share = await prisma.shareLink.create({
            data : {
                user: {
                    connect: { id: userId }
                },
                rootPath: reqPath,
                recursive: recursive ?? null,
                expireAt: expireAt ?? null
            }
        })

        const url = `/api/user/share/id/${share.id}`

        return NextResponse.json(
            {sharelink:  url}
        )

    } catch (err: unknown) {
        logerror('[user share post failed] :', err)
        return NextResponse.json(
            { error: 'Internal Error' },
            { status: 500 }
        )
    }
}