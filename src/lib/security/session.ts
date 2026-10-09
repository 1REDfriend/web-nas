import { createHash, randomBytes } from "crypto";
import { jwtVerify, SignJWT } from "jose";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ENV } from "@/lib/ENV";

// A login creates one ActiveSession row; its id travels in the JWT as "jti".
// A token is only accepted while that row exists and has not expired, so
// logout, password changes and user deletion take effect immediately.
//
// Two limits apply:
//   - idle: the row's expiresAt, pushed forward while the session is in use
//   - absolute: the JWT's own exp, after which the user must log in again
// The token itself never changes, so parallel requests never race a rotation.

export const SESSION_IDLE_SECONDS = 60 * 60;
export const SESSION_MAX_SECONDS = 7 * 24 * 60 * 60;
// Write the new idle deadline at most this often per session
const IDLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionUser = {
    sessionId: string;
    userId: string;
    username: string;
    role: Role;
    mustChangePassword: boolean;
};

function secretKey() {
    if (!ENV.JWT_SECRET) throw new Error("JWT_SECRET is not set");
    return new TextEncoder().encode(ENV.JWT_SECRET);
}

function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

export async function createSession(user: { id: string; username: string }, userAgent: string) {
    const sessionId = randomBytes(18).toString("base64url");
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_IDLE_SECONDS * 1000);
    const absoluteExpiry = Math.floor((now + SESSION_MAX_SECONDS * 1000) / 1000);

    const token = await new SignJWT({ username: user.username })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(user.id)
        .setJti(sessionId)
        .setIssuedAt()
        .setExpirationTime(absoluteExpiry)
        .sign(secretKey());

    await prisma.activeSession.deleteMany({
        where: { userId: user.id, expiresAt: { lte: new Date() } },
    });

    await prisma.activeSession.create({
        data: {
            id: sessionId,
            userId: user.id,
            token: hashToken(token),
            userAgent: userAgent.slice(0, 300),
            expiresAt,
        },
    });

    return { token, expiresAt };
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
        if (typeof payload.sub !== "string" || typeof payload.jti !== "string") return null;

        const session = await prisma.activeSession.findUnique({
            where: { id: payload.jti },
            include: { user: { select: { id: true, username: true, role: true, mustChangePassword: true } } },
        });

        const now = Date.now();
        if (
            !session ||
            session.userId !== payload.sub ||
            session.token !== hashToken(token) ||
            session.expiresAt.getTime() <= now
        ) {
            return null;
        }

        const idleDeadline = now + SESSION_IDLE_SECONDS * 1000;
        if (idleDeadline - session.expiresAt.getTime() >= IDLE_REFRESH_INTERVAL_MS) {
            await prisma.activeSession.updateMany({
                where: { id: session.id },
                data: { expiresAt: new Date(idleDeadline) },
            });
        }

        return {
            sessionId: session.id,
            userId: session.user.id,
            username: session.user.username,
            role: session.user.role,
            mustChangePassword: session.user.mustChangePassword,
        };
    } catch {
        return null;
    }
}

export async function revokeSession(sessionId: string) {
    await prisma.activeSession.deleteMany({ where: { id: sessionId } });
}

export async function revokeAllSessions(userId: string) {
    await prisma.activeSession.deleteMany({ where: { userId } });
}

function cookieOptions(value: string, maxAge: number) {
    return {
        name: ENV.TOKEN_COOKIE,
        value,
        maxAge,
        httpOnly: true,
        secure: true,
        sameSite: "strict" as const,
        path: "/",
        ...(ENV.COOKIE_DOMAIN ? { domain: ENV.COOKIE_DOMAIN } : {}),
    };
}

export function setSessionCookie(response: NextResponse, token: string) {
    // The browser keeps the cookie for the absolute lifetime; the idle limit is enforced server-side
    response.cookies.set(cookieOptions(token, SESSION_MAX_SECONDS));
}

export function clearSessionCookie(response: NextResponse) {
    response.cookies.set(cookieOptions("", 0));
}
