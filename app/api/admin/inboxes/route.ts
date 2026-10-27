import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { requireInboxAdmin } from "@/lib/inbox/admin";
import { publicOrigin } from "@/lib/api/v1/drops";
import { toOwnerInbox } from "@/lib/inbox/inboxes";
import { getInboxSettings, saveInboxSettings, validateInboxSettings } from "@/lib/inbox/settings";

async function payload(request: Request) {
    const [settings, inboxes] = await Promise.all([
        getInboxSettings(),
        prisma.inbox.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { username: true } } } }),
    ]);
    const origin = publicOrigin(request.headers, request.url);
    return {
        settings,
        inboxes: inboxes.map((inbox) => ({ ...toOwnerInbox(inbox, origin), owner: inbox.user.username })),
    };
}

// Settings plus every user's upload links
export async function GET(request: Request) {
    const { error } = await requireInboxAdmin();
    if (error) return error;

    try {
        return NextResponse.json(await payload(request), { headers: { "Cache-Control": "no-store" } });
    } catch (err: unknown) {
        logerror("[inbox settings GET failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// Body: any of { enabled, roles, quotaMB, allowNoExpiry }
export async function PUT(request: Request) {
    const { error } = await requireInboxAdmin();
    if (error) return error;

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

        await saveInboxSettings(await validateInboxSettings(body));
        return NextResponse.json(await payload(request));
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[inbox settings PUT failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
