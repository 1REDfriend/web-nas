import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setting } from "@/lib/ENV";
import { authorizePath, FileAccessError, fileAccessErrorResponse, getAccessUser } from "@/lib/security/path-guard";
import { createShareId, isShareExpired, resolveShare } from "@/lib/security/share-access";

const DAY_MS = 24 * 60 * 60 * 1000;

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
            where: { userId },
            orderBy: { createAt: 'desc' }
        });

        const userShare = await Promise.all(rawShares.map(async (shareLink) => {
            let status = 'Active';
            let type: 'file' | 'folder' | null = null;

            if (isShareExpired(shareLink)) {
                status = 'Expired';
            } else {
                try {
                    const resolved = await resolveShare(shareLink.id);
                    type = resolved.isDirectory ? 'folder' : 'file';
                } catch (err: unknown) {
                    if (!(err instanceof FileAccessError)) throw err;
                    status = 'Unavailable';
                }
            }

            return {
                id: shareLink.id,
                name: shareLink.rootPath,
                type,
                url: `${setting.frontend.shareURL}${shareLink.id}`,
                view: shareLink.view,
                recursive: shareLink.recursive,
                createAt: shareLink.createAt,
                expiresAt: shareLink.expireAt,
                status
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

    let expireDate = new Date(Date.now() + setting.expireShareLink * DAY_MS);
    if (expireAt !== undefined && expireAt !== null) {
        expireDate = new Date(expireAt);
        if (Number.isNaN(expireDate.getTime()) || expireDate.getTime() <= Date.now()) {
            return NextResponse.json(
                { error: 'Expiry date must be in the future' },
                { status: 400 }
            )
        }
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
        const user = await getAccessUser(userId);
        if (!user) {
            return NextResponse.json(
                { error: "Unable to verify identity" },
                { status: 401 }
            )
        }

        const { virtualPath } = await authorizePath(user, reqPath, "SHARE", { includeSubtree: true });

        const share = await prisma.shareLink.create({
            data : {
                id: createShareId(),
                user: {
                    connect: { id: userId }
                },
                rootPath: virtualPath,
                recursive: recursive === true,
                expireAt: expireDate
            }
        })

        const url = `${setting.frontend.shareURL}${share.id}`

        return NextResponse.json(
            { sharelink: url, url, expireAt: share.expireAt }
        )

    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror('[user share post failed] :', err)
        return NextResponse.json(
            { error: 'Internal Error' },
            { status: 500 }
        )
    }
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json(
            { error: 'Invalid ShareLink' },
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
        const { count } = await prisma.shareLink.deleteMany({
            where: {
                userId,
                id
            }
        })

        if (count === 0) {
            return NextResponse.json(
                { error: 'Share link not found' },
                { status: 404 }
            )
        }

        return NextResponse.json(
            {success: true, message: 'Delete link Successful'}
        )
    } catch (err: unknown) {
        logerror('[user delete share link failed] :', err)
        return NextResponse.json(
            { error: 'Internal Error' },
            { status: 500 }
        )
    }
}