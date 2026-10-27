import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { INBOX_ID_RE } from "@/lib/inbox/inboxes";
import { requireInboxAdmin } from "@/lib/inbox/admin";

// Body: { closed: boolean }. Lets an admin pause anyone's upload link.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireInboxAdmin();
    if (error) return error;

    try {
        const { id } = await params;
        const body = await request.json().catch(() => null);
        if (typeof body?.closed !== "boolean") return NextResponse.json({ error: "closed must be true or false" }, { status: 400 });
        if (!INBOX_ID_RE.test(id)) return NextResponse.json({ error: "Upload link not found" }, { status: 404 });

        const { count } = await prisma.inbox.updateMany({ where: { id }, data: { closedAt: body.closed ? new Date() : null } });
        if (count === 0) return NextResponse.json({ error: "Upload link not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        logerror("[admin inbox PATCH failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
