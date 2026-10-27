import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { getRequestUser } from "@/lib/security/path-guard";
import { REQUEST_ID_RE } from "@/lib/drops/requests";

// PATCH /api/admin/drops/requests?id=...  body { closed: boolean }
// Lets an admin pause or reopen anyone's drop request.
export async function PATCH(request: Request) {
    const user = await getRequestUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Only ADMIN can change drop settings" }, { status: 403 });

    try {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const body = await request.json().catch(() => null);
        if (typeof body?.closed !== "boolean") return NextResponse.json({ error: "closed must be true or false" }, { status: 400 });
        if (!REQUEST_ID_RE.test(id)) return NextResponse.json({ error: "Drop request not found" }, { status: 404 });

        const { count } = await prisma.dropRequest.updateMany({ where: { id }, data: { closedAt: body.closed ? new Date() : null } });
        if (count === 0) return NextResponse.json({ error: "Drop request not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        logerror("[admin drop request PATCH failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
