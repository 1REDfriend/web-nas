import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { publicOrigin } from "@/lib/api/v1/drops";
import { INBOX_DEFAULTS, createInbox, inboxUsage, listOwnInboxes, toOwnerInbox } from "@/lib/inbox/inboxes";
import { getInboxSettings } from "@/lib/inbox/settings";

// The signed-in user's upload links (browser session only; proxy.ts refuses API keys here)

export async function GET(request: Request) {
    const user = await getRequestUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const [settings, inboxes, quota] = await Promise.all([getInboxSettings(), listOwnInboxes(user.id), inboxUsage(user.id)]);
        const origin = publicOrigin(request.headers, request.url);
        return NextResponse.json({
            inboxes: inboxes.map((inbox) => toOwnerInbox(inbox, origin)),
            canCreate: settings.enabled && settings.roles.includes(user.role),
            enabled: settings.enabled,
            allowNoExpiry: settings.allowNoExpiry,
            defaults: INBOX_DEFAULTS,
            quota,
            origin,
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (err: unknown) {
        logerror("[inboxes GET failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// Body: see InboxInput in src/lib/inbox/inboxes.ts
export async function POST(request: Request) {
    const user = await getRequestUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

        const inbox = await createInbox(user, body);
        return NextResponse.json({ inbox: toOwnerInbox(inbox, publicOrigin(request.headers, request.url)) }, { status: 201 });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[inboxes POST failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
