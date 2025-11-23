import { UserJwtPayload } from "@/interfaces/userJwtpayload";
import { logerror } from "@/lib/logger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { error } from "console";

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqPath = searchParams.get('path');
    const reqFavoritePath = searchParams.get('like')

    const headersList = await headers();
    const payloadString = headersList.get('x-user-payload');

    if (!payloadString) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const userPayload: UserJwtPayload = await JSON.parse(payloadString);
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
            if (!reqFavoritePath) {
                return NextResponse.json(
                    { error: "No Path Like found" },
                    { status: 400 }
                )
            }

            const exitsPathLike = await prisma.categoryPath.findFirst({
                where: {
                    userId: userId,
                    pathMapCategory: {
                        some: {
                            rootPath: reqFavoritePath
                        }
                    }
                },
                include: {
                    pathMapCategory: {
                        where: {
                            rootPath: reqFavoritePath
                        }
                    }
                }
            })

            if (!exitsPathLike || exitsPathLike?.pathMapCategory) {
                return NextResponse.json(
                    { error: "Path is exited" },
                    { status: 400 }
                )
            }

            const categoryPath = await prisma.categoryPath.findFirst({
                where: {
                    userId: userId,
                    rootPath: reqPath
                }
            })

            if (!categoryPath) {
                return NextResponse.json(
                    { error: "Path is not found" },
                    { status: 400 }
                )
            }

            await prisma.pathMapCategory.create({
                data: {
                    categoryPathId: categoryPath.id,
                    rootPath: reqFavoritePath
                }
            })

            return NextResponse.json(
                { message: "Favorite Folder successful" }
            )
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
            where : {userId: userId},
            select : {
                id: true,
                rootPath: true,
                pathMapCategory: true
            }
        })

        return NextResponse.json(
            {message: 'get successful', categoryPath}
        )
    } catch (err : unknown) {
        logerror("[get create folder failed] : " + err)
        return NextResponse.json(
            { error: "internal Error : who are you" },
            { status: 500 }
        )
    }
}