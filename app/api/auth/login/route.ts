import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from '@/lib/db';
import { verifyPassword } from "@/lib/security/credentials";
import { createSession, setSessionCookie } from "@/lib/security/session";
import { getClientIp, LimitRule, recordAttempt, resetLimits, retryAfterSeconds } from "@/lib/security/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

function loginLimits(ip: string, username: string): LimitRule[] {
    const name = username.toLowerCase();
    return [
        { key: `login:ip-user:${ip}:${name}`, limit: 5, windowMs: WINDOW_MS },
        { key: `login:ip:${ip}`, limit: 30, windowMs: WINDOW_MS },
        { key: `login:user:${name}`, limit: 50, windowMs: WINDOW_MS },
    ];
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { username, password } = body;

        if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            );
        }

        const limits = loginLimits(getClientIp(request), username);
        const wait = retryAfterSeconds(limits);
        if (wait > 0) {
            return NextResponse.json(
                { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
                { status: 429, headers: { 'Retry-After': String(wait) } }
            );
        }

        const user = await prisma.user.findUnique({
            where: { username }
        });

        if (!(await verifyPassword(password, user?.passwordHash)) || !user) {
            recordAttempt(limits);
            return NextResponse.json(
                { error: 'Invalid username or password' },
                { status: 401 }
            );
        }

        resetLimits([limits[0].key]);

        const { token } = await createSession(user, request.headers.get('user-agent') || 'Unknown Device');

        const response = NextResponse.json(
            {
                message: 'Login successful',
                user: user.username,
                mustChangePassword: user.mustChangePassword,
            },
            { status: 200 }
        );
        setSessionCookie(response, token);

        return response;
    } catch (err: unknown) {
        logerror("[Login Failed] : " + err);
        return NextResponse.json(
            { error: 'Internal Error.' },
            { status: 500 }
        )
    }
}
