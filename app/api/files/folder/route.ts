import { UserJwtPayload } from "@/interfaces/userJwtpayload";
import { logerror } from "@/lib/logger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import fs from "fs-extra";
import { pathReplaceValidate } from "@/lib/reosolvePath";
import { ENV } from "@/lib/ENV";

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqPath = searchParams.get('path');
    const reqFavoritePath = searchParams.get('like')
    const userPayload = await xUserPayload()

    if (!userPayload) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }
    const userId = userPayload.sub;

    try {
        const userRole = await prisma.user.findUnique({
            where: {
                id: userId
            },
            select: {
                role: true
            }
        })

        if (userRole?.role == "GUEST") {
            return NextResponse.json(
                { error: "You can not create" },
                { status: 403 }
            )
        }
    } catch (err: unknown) {
        logerror("[userRole check folder create failed] : " + err)
        return NextResponse.json(
            { error: "internal Error : who are you" },
            { status: 500 }
        )
    }

    try {
        if (!reqPath) {
            return NextResponse.json(
                { error: "No Path Found" },
                { status: 404 }
            )
        }

        if (!reqFavoritePath) {
            const existsCategory = await prisma.categoryPath.findFirst({
                where: {
                    userId: userId,
                    rootPath: reqPath
                }
            })

            if (existsCategory) {
                return NextResponse.json(
                    { error: "This directory is exited." },
                    { status: 400 }
                )
            }

            const validatedSuffix = await pathReplaceValidate(reqPath);
            const validatedSuffixUserId = await pathReplaceValidate(userId)

            if (!validatedSuffix) {
                logerror("[Normalize folder path Failed]")
                return NextResponse.json(
                    { error: "No Path Found" },
                    { status: 400 }
                )
            }

            const fullPath = ENV.STORAGE_INTERNAL + validatedSuffixUserId + validatedSuffix;

            await fs.ensureDir(fullPath)

            await prisma.categoryPath.create({
                data: {
                    userId: userId,
                    rootPath: reqPath
                }
            })

            return NextResponse.json(
                { message: "Create Folder successful" }
            )
        } else {
            //! Nothing wait for build move folder
        }
    } catch (err: unknown) {
        logerror("[create folder failed] : " + err)
        return NextResponse.json(
            { error: "internal Error : who are you" },
            { status: 500 }
        )
    }
}

export async function GET() {
    const userPayload = await xUserPayload()

    if (!userPayload) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const userId = userPayload.sub

    try {
        const categoryPath = await prisma.categoryPath.findMany({
            where: { userId: userId },
            select: {
                id: true,
                rootPath: true,
                pathMapCategory: true
            }
        })

        return NextResponse.json(
            { message: 'get successful', categoryPath }
        )
    } catch (err: unknown) {
        logerror("[get create folder failed] : " + err)
        return NextResponse.json(
            { error: "internal Error : who are you" },
            { status: 500 }
        )
    }
}