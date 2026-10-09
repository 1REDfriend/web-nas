// proxy.ts (Next.js 16 runs this on the Node.js runtime, so it can reach the database)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ENV } from '@/lib/ENV';
import { clearSessionCookie, verifySessionToken } from '@/lib/security/session';

// Reachable without login. They still get the user header when a valid session exists.
const OPEN_PREFIXES = ['/api/auth/', '/api/public/'];

function jsonError(message: string, status: number, extra: Record<string, string> = {}) {
    return NextResponse.json({ error: message, ...extra }, { status });
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isOpen = OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    // Route handlers trust this header, so never let a client supply it
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-user-payload');

    const token = request.cookies.get(ENV.TOKEN_COOKIE)?.value;
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
        }));
    } else if (!isOpen) {
        const response = jsonError(token ? 'Session expired. Please log in again.' : 'Authentication required.', 401);
        if (token) clearSessionCookie(response);
        return response;
    }

    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
}

export const config = {
    matcher: ['/api/:path*'],
};
