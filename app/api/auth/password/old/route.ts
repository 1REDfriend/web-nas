import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from '@/lib/db';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
    const body = await request.json();
    const { username ,oldPassword, newPassword} = body;

    try {
        if (!username || !oldPassword || !newPassword) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            )
        }

        const user = await prisma.user.findUnique({
            where: {username : username}
        })

        if (!user) {
            return NextResponse.json(
                { error : 'Username or Password Invalid'},
                { status: 400}
            );
        }

        const isUser = await bcrypt.compare(oldPassword, user.passwordHash);

        if (!isUser) {
            return NextResponse.json(
                { error : 'Username or Password Invalid'},
                { status: 400}
            );
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 11)

        await prisma.user.update({
            where: {username : username},
            data: {passwordHash: newPasswordHash}
        })

        await prisma.activeSession.deleteMany({
            where: {id : user.id}
        })

        return NextResponse.json(
            {
                message: 'Password Change successful',
                user: username
            }
        )
    } catch (err : unknown) {
        logerror("Old Password Change Failed : " + err);
        return NextResponse.json(
            { error : 'Internal Error.'},
            { status: 500}
        )
    }
}