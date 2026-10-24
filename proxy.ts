// proxy.ts (Next.js 16 runs this on the Node.js runtime, so it can reach the database)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ENV } from '@/lib/ENV';
import { clearSessionCookie, verifySessionToken } from '@/lib/security/session';
import { getClientIp } from '@/lib/security/rate-limit';
import { authenticateV1, v1AuthErrorResponse } from '@/lib/api/v1/auth';

// Reachable without login. They still get the user header when a valid session exists.
const OPEN_PREFIXES = ['/api/auth/', '/api/public/'];
// The only routes that accept an API key (see src/lib/api/v1/auth.ts). Everything else needs a login session.
const API_V1_PREFIX = '/api/v1/';

function jsonError(message: string, status: number, extra: Record<string, string> = {}) {
    return NextResponse.json({ error: message, ...extra }, { status });
}

function forward(requestHeaders: Headers) {
    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isOpen = OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    // Route handlers trust this header, so never let a client supply it
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-user-payload');

    const token = request.cookies.get(ENV.TOKEN_COOKIE)?.value;

    if (pathname.startsWith(API_V1_PREFIX)) {
        const result = await authenticateV1({
            authorization: request.headers.get('authorization'),
            sessionToken: token,
            ip: getClientIp(request),
        });
        if (!result.ok) {
            const response = v1AuthErrorResponse(result);
            if (result.clearCookie) clearSessionCookie(response);
            return response;
        }
        requestHeaders.set('x-user-payload', JSON.stringify(result.payload));
        return forward(requestHeaders);
    }

    const user = await verifySessionToken(token);

    if (user) {
        if (user.mustChangePassword && !isOpen) {
            return jsonError('Password change required.', 403, { code: 'PASSWORD_CHANGE_REQUIRED' });
        }

        requestHeaders.set('x-user-payload', JSON.stringify({
            sub: user.userId,
            sid: user.sessionId,
            username: user.username,
            role: user.role,
            via: 'session',
        }));
    } else if (!isOpen) {
        const response = jsonError(token ? 'Session expired. Please log in again.' : 'Authentication required.', 401);
        if (token) clearSessionCookie(response);
        return response;
    }

    return forward(requestHeaders);
}

export const config = {
    // The streaming upload routes are left out: proxy buffers request bodies in memory.
    // They authenticate themselves with authenticateV1() and never read x-user-payload.
    matcher: ['/api/((?!v1/files/(?:upload|raw)(?:/|$)).*)'],
};
