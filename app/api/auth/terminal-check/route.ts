import { NextResponse } from "next/server";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { prisma } from "@/lib/db";

// Called by Caddy's forward_auth before every request to the web terminal (port 7255).
// 2xx lets the request through; anything else is returned to the browser instead.
// proxy.ts has already verified the session cookie when the payload is present.
async function check() {
    const payload = await xUserPayload();
    if (!payload?.sub) {
        return NextResponse.json({ error: "Log in to the file manager first." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { role: true, mustChangePassword: true },
    });

    if (!user || user.mustChangePassword) {
        return NextResponse.json({ error: "Log in to the file manager first." }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
        return NextResponse.json({ error: "Only ADMIN can open the terminal." }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
}

export async function GET() {
    return check();
}

export async function HEAD() {
    return check();
}
