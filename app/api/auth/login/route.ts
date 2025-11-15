import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/db';
import { SignJWT } from 'jose';;
import { ENV } from "@/lib/ENV";

export async function POST(request: Request) {
    const body = await request.json();
    const { username, password } = body;

    try {
        if (!username || !password) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: {
                username: username
            }
        })

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid username or password' },
                { status: 401 }
            );
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
            return NextResponse.json(
                { error: 'Invalid username or password' },
                { status: 401 }
            );
        }

        const payload = {
            userId: user.id,
            username: user.username,
        };

        if (!ENV.JWT_SECRET) {
            logerror("JWT_SECRET is not defined in environment variables.");
            return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
        }

        const secret = new TextEncoder().encode(ENV.JWT_SECRET);

        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(user.id as string)
            .setExpirationTime('1h')
            .setIssuedAt()
            .sign(secret);

        const userAgent = request.headers.get('user-agent') || 'Unknown Device';

        await prisma.activeSession.create({
            data: {
                userId: user.id,
                token: token,
                userAgent: userAgent,
            }
        });

        const response = NextResponse.json(
            {
                message: 'Login successful',
                user: user.username
            },
            { status: 200 }
        );

        response.cookies.set({
            name: ENV.TOKEN_COOKIE,
            value: token,
            maxAge: 60 * 60 * 1,
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            path: '/',
        });

        return response;
    } catch (err: unknown) {
        logerror("[Login Failed] : " + err);
        return NextResponse.json(
            { error: 'Internal Error.' },
            { status: 500 }
        )
    }
}