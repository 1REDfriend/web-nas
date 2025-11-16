import { NextRequest, NextResponse } from "next/server";
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/db';
import { log, logerror } from "@/lib/logger";
import { cookies } from "next/headers";
import jwt, { JwtPayload } from "jsonwebtoken";
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

        const existingUser = await prisma.user.findUnique({
            where: { username: username }
        });

        const admin = await prisma.user.findMany({
            where: { role: "ADMIN" }
        })

        if (admin.length > 0) {
            const cookieStore = await cookies();
            const authCookie = cookieStore.get(ENV.TOKEN_COOKIE);

            if (!authCookie?.value) {
                return NextResponse.json(
                    { error: 'Unauthorized: Missing token' },
                    { status: 401 }
                );
            }

            if (authCookie?.value) {
                let userJwtPayload: string | JwtPayload;
                try {
                    userJwtPayload = jwt.verify(authCookie.value, ENV.JWT_SECRET);
                } catch (err: unknown) {
                    logerror("[JWT FAILED] : " + err);
                    return NextResponse.json(
                        { error: 'Internal Error.' },
                        { status: 500 }
                    )
                }

                if (typeof userJwtPayload === 'object' && 'id' in userJwtPayload) {
                    const userId = userJwtPayload.id;

                    const user = await prisma.user.findUnique({
                        where: { id: userId }
                    });

                    if (!user) {
                        return NextResponse.json(
                            { error: 'Unauthorized: User not found' },
                            { status: 401 }
                        );
                    }

                    if (user.role != "ADMIN") {
                        return NextResponse.json(
                            { error: 'Unauthorized: User not allow permission' },
                            { status: 401 }
                        );
                    }
                }
            }
        }

        if (existingUser) {
            return NextResponse.json(
                { error: 'Username already exists' },
                { status: 409 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters long' },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 11);

        await prisma.user.create({
            data: {
                username: username,
                passwordHash: hashedPassword,
                role: admin.length > 0 ? 'USER' : 'ADMIN'
            }
        });

        log("Registration successful for : " + username);

        return NextResponse.json(
            { message: 'User registered successfully' },
            { status: 201 }
        );
    } catch (err: unknown) {
        logerror("[Registor User Failed] : " + err);
        return NextResponse.json(
            { error: 'Internal Error.' },
            { status: 500 }
        )
    }
}