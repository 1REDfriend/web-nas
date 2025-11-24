import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { xUserPayload } from "@/lib/api/user/x-user-payload";

export async function DELETE(req: Request) {
    try {
        const body = await req.json();
        const { username, userId: targetId } = body;

        const userPayload = await xUserPayload();
        if (!userPayload) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const requesterId = userPayload.sub;

        const requester = await prisma.user.findUnique({
            where: { id: requesterId },
        });

        if (!requester) {
            return NextResponse.json({ message: "Requester not found" }, { status: 401 });
        }

        if (requester.role !== "ADMIN") {
            return NextResponse.json(
                { message: "Forbidden: You do not have permission to delete users." },
                { status: 403 }
            );
        }

        if (!username && !targetId) {
            return NextResponse.json(
                { message: "Please provide either 'username' or 'userId' to delete." },
                { status: 400 }
            );
        }

        const targetUser = await prisma.user.findFirst({
            where: {
                OR: [
                    ...(targetId ? [{ id: targetId }] : []),
                    ...(username ? [{ username: username }] : []),
                ],
            },
        });

        if (!targetUser) {
            return NextResponse.json(
                { message: "User not found." },
                { status: 404 }
            );
        }

        if (targetUser.id === requester.id) {
            return NextResponse.json(
                { message: "You cannot delete your own account via this API." },
                { status: 400 }
            );
        }

        await prisma.user.delete({
            where: { id: targetUser.id },
        });

        return NextResponse.json({
            message: `User '${targetUser.username}' deleted successfully`,
            deletedUser: {
                id: targetUser.id,
                username: targetUser.username
            }
        }, { status: 200 });

    } catch (error) {
        console.error("Delete User Error:", error);
        return NextResponse.json(
            { message: "Internal Server Error" },
            { status: 500 }
        );
    }
}