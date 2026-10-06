import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    const payload = await xUserPayload()
    const user = payload?.sub
        ? await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { username: true, role: true, mustChangePassword: true },
        })
        : null

    if (!user) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    return NextResponse.json({
        message: 'User is Login',
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
    });
}
