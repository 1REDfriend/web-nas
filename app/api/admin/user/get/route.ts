import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { xUserPayload } from "@/lib/api/user/x-user-payload";

export async function GET(req: Request) {
    try {
        const userPayload = await xUserPayload();
        if (!userPayload) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const requesterId = userPayload.sub;

        const requester = await prisma.user.findUnique({
            where: { id: requesterId },
            select: { id: true, role: true }
        });

        if (!requester) {
            return NextResponse.json({ message: "Requester not found" }, { status: 401 });
        }

        if (requester.role !== "ADMIN") {
            return NextResponse.json(
                { message: "Forbidden: Only ADMIN can retrieve user data." },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(req.url);
        const targetId = searchParams.get("id");
        const targetUsername = searchParams.get("username");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");

        if (targetId || targetUsername) {
            const user = await prisma.user.findFirst({
                where: {
                    OR: [
                        ...(targetId ? [{ id: targetId }] : []),
                        ...(targetUsername ? [{ username: targetUsername }] : []),
                    ],
                },
                select: {
                    id: true,
                    username: true,
                    role: true,
                    gmail: true,
                    createdAt: true,
                }
            });

            if (!user) {
                return NextResponse.json({ message: "User not found" }, { status: 404 });
            }

            return NextResponse.json({ user }, { status: 200 });
        }

        const skip = (page - 1) * limit;

        const [users, totalCount] = await prisma.$transaction([
            prisma.user.findMany({
                skip: skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    username: true,
                    role: true,
                    gmail: true,
                    createdAt: true,
                }
            }),
            prisma.user.count()
        ]);

        return NextResponse.json({
            users,
            meta: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        }, { status: 200 });

    } catch (error) {
        console.error("Get Users Error:", error);
        return NextResponse.json(
            { message: "Internal Server Error" },
            { status: 500 }
        );
    }
}