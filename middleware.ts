// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { ENV } from '@/lib/ENV';
import { log, logerror } from '@/lib/logger';

const COOKIE_NAME = ENV.TOKEN_COOKIE;
const secret = new TextEncoder().encode(ENV.JWT_SECRET);

function forbiddenResponse(message: string) {
    return new NextResponse(
        JSON.stringify({ message: message }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
}

export async function middleware(request: NextRequest) {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
        return new NextResponse(
            JSON.stringify({ message: 'Authentication required.' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }


    try {
        const { payload } = await jwtVerify(token, secret);
        const userId = payload.sub;

        if (!userId || typeof userId !== 'string') {
            logerror('[Middleware] Invalid user ID in JWT payload.\n => ' + payload.sub);
            return forbiddenResponse('Invalid user session.');
        }

        const { searchParams } = request.nextUrl;
        const pathFromQuery = searchParams.get('path');

        let pathFromDestination: string | null = null;
        const contentType = request.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            try {
                const clonedRequest = request.clone();
                const body = await clonedRequest.json();
                if (body.destination && typeof body.destination === 'string') {
                    pathFromDestination = body.destination;
                }
            } catch (e) {
                logerror('[Middleware] Failed to parse body: ' + e);
            }
        }

        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-user-payload', JSON.stringify(payload));

        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });

    } catch (err: unknown) {
        logerror('[JWT Verification Failed] :' + err);

        const response = new NextResponse(
            JSON.stringify({ message: 'Invalid token.' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );

        response.cookies.delete(COOKIE_NAME);

        return response;
    }
}

export const config = {
    matcher: [
        '/api/((?!auth|_next/static|_next/image|favicon.ico).*)'
    ],
};