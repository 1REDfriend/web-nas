// proxy.ts (Next.js 16 runs this on the Node.js runtime, so it can reach the database)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ENV } from '@/lib/ENV';
import { clearSessionCookie, verifySessionToken } from '@/lib/security/session';
import { canUseApiKeys, verifyApiKey } from '@/lib/security/api-key';
import { apiKeyFromAuthorization } from '@/lib/security/api-key-format';
import { getClientIp, LimitRule, recordAttempt, retryAfterSeconds } from '@/lib/security/rate-limit';
import { apiError } from '@/lib/api/v1/response';

// Reachable without login. They still get the user header when a valid session exists.
const OPEN_PREFIXES = ['/api/auth/', '/api/public/'];
// The only routes that accept an API key. Everything else needs a login session.
const API_KEY_PREFIX = '/api/v1/';

const BAD_KEY_WINDOW_MS = 15 * 60 * 1000;
const BAD_KEY_LIMIT = 20;

function jsonError(message: string, status: number, extra: Record<string, string> = {}) {
    return NextResponse.json({ error: message, ...extra }, { status });
}

function badKeyLimits(ip: string): LimitRule[] {
    return [{ key: `apikey-fail:ip:${ip}`, limit: BAD_KEY_LIMIT, windowMs: BAD_KEY_WINDOW_MS }];
}

function forward(requestHeaders: Headers) {
    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
}

// An "Authorization: Bearer ..." request to /api/v1 is judged on the key alone; a
// browser cookie sent alongside it is ignored, so a bad key never falls back to it.
async function authenticateApiKey(request: NextRequest, requestHeaders: Headers, authorization: string) {
    const ip = getClientIp(request);
    const limits = badKeyLimits(ip);
    const wait = retryAfterSeconds(limits);
    if (wait > 0) {
        return apiError(429, 'RATE_LIMITED', 'Too many invalid API keys. Try again later.', { 'Retry-After': String(wait) });
    }

    const principal = await verifyApiKey(apiKeyFromAuthorization(authorization), ip);
    if (!principal) {
        recordAttempt(limits);
        return apiError(401, 'INVALID_API_KEY', 'Invalid or expired API key.');
    }
    if (!canUseApiKeys(principal.role)) {
        return apiError(403, 'API_KEY_NOT_ALLOWED', 'This account cannot use API keys.');
    }
    if (principal.mustChangePassword) {
        return apiError(403, 'PASSWORD_CHANGE_REQUIRED', 'The key owner must change their password first.');
    }

    requestHeaders.set('x-user-payload', JSON.stringify({
        sub: principal.userId,
        username: principal.username,
        role: principal.role,
        via: 'apikey',
        keyId: principal.keyId,
        scopes: principal.scopes,
        keyRoot: principal.rootPath,
    }));
    return forward(requestHeaders);
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isOpen = OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    // Route handlers trust this header, so never let a client supply it
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-user-payload');

    const isApiV1 = pathname.startsWith(API_KEY_PREFIX);
    const authorization = request.headers.get('authorization');
    if (isApiV1 && authorization && /^Bearer\s/i.test(authorization)) {
        return authenticateApiKey(request, requestHeaders, authorization);
    }

    const token = request.cookies.get(ENV.TOKEN_COOKIE)?.value;
    const user = await verifySessionToken(token);

    if (user) {
        if (user.mustChangePassword && !isOpen) {
            if (isApiV1) return apiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Password change required.');
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
        const message = token ? 'Session expired. Please log in again.' : 'Authentication required.';
        const response = isApiV1 ? apiError(401, 'UNAUTHORIZED', message) : jsonError(message, 401);
        if (token) clearSessionCookie(response);
        return response;
    }

    return forward(requestHeaders);
}

export const config = {
    matcher: ['/api/:path*'],
};
