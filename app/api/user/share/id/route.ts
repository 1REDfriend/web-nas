import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSafePath } from "@/lib/routes/filesystem/utils";
import fs from 'fs-extra'
import { getShareLinkFile } from "@/lib/service/file-sharelink.service";

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqId = searchParams.get('id');

    if (!reqId) {
        return NextResponse.json(
            { error: 'id not found.' },
            { status: 400 }
        )
    }

    try {
        const shareLink = await prisma.shareLink.findUnique({
            where: {
                id: reqId
            }
        })

        if (!shareLink) {
            return NextResponse.json(
                { error: 'Share Link not found.' },
                { status: 400 }
            )
        }

        const physicalPath = getSafePath(shareLink.rootPath)

        if (! await fs.pathExists(physicalPath)) {
            return NextResponse.json(
                { error: 'Share Link file not found.' },
                { status: 403 }
            )
        }

        const { data, totalFiles } = await getShareLinkFile({physicalPath, recursive: shareLink.recursive})

        return NextResponse.json({
            data,
            meta: {
                totalFiles,
            }
        });
    } catch (err: unknown) {
        logerror("[user share id failed] : ", err)
        return NextResponse.json(
            { error: 'Internal Error' },
            { status: 500 }
        )
    }
}