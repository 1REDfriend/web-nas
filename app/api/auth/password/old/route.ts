import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from '@/lib/db';
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/security/credentials";
import { clearSessionCookie, revokeAllSessions } from "@/lib/security/session";
import { LimitRule, recordAttempt, retryAfterSeconds } from "@/lib/security/rate-limit";

// Changes the password of the logged-in user (identified by the session, not the body)
export async function POST(request: Request) {
    const payload = await xUserPayload();
    if (!payload?.sub) {
        return NextResponse.json(
            { error: 'Please log in first' },
            { status: 401 }
        )
    }

    const limits: LimitRule[] = [{ key: `password:${payload.sub}`, limit: 5, windowMs: 15 * 60 * 1000 }];

    try {
        const body = await request.json().catch(() => ({}));
        const { oldPass: oldPassword, newPass: newPassword } = body;

        if (typeof oldPassword !== "string" || !oldPassword) {
            return NextResponse.json(
                { error: 'Current password is required' },
                { status: 400 }
            )
        }

        const problem = validatePassword(newPassword);
        if (problem) {
            return NextResponse.json({ error: problem }, { status: 400 });
        }

        if (newPassword === oldPassword) {
            return NextResponse.json(
                { error: 'New password must be different from the current one' },
                { status: 400 }
            )
        }

        const wait = retryAfterSeconds(limits);
        if (wait > 0) {
            return NextResponse.json(
                { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
                { status: 429, headers: { 'Retry-After': String(wait) } }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: payload.sub }
        })

        if (!user || !(await verifyPassword(oldPassword, user.passwordHash))) {
            recordAttempt(limits);
            return NextResponse.json(
                { error : 'Current password is incorrect'},
                { status: 400}
            );
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: await hashPassword(newPassword),
                mustChangePassword: false,
            }
        })

        // Every device, including this one, has to log in again with the new password
        await revokeAllSessions(user.id);

        const response = NextResponse.json(
            {
                message: 'Password changed. Please log in again.',
                user: user.username
            }
        )
        clearSessionCookie(response);

        return response;
    } catch (err : unknown) {
        logerror("Old Password Change Failed : " + err);
        return NextResponse.json(
            { error : 'Internal Error.'},
            { status: 500}
        )
    }
}
