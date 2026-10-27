import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { publicOrigin } from "@/lib/api/v1/drops";
import { deleteInbox, findOwnInbox, toOwnerInbox, updateInbox } from "@/lib/inbox/inboxes";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "Upload link not found" };
const RECEIPTS_SHOWN = 200;

// One upload link with the files it received (newest first)
export async function GET(request: Request, { params }: Params) {
    const user = await getRequestUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const inbox = await findOwnInbox(user.id, (await params).id);
        if (!inbox) return NextResponse.json(NOT_FOUND, { status: 404 });

        const uploads = await prisma.inboxUpload.findMany({
            where: { inboxId: inbox.id },
            orderBy: { createdAt: "desc" },
            take: RECEIPTS_SHOWN,
        });
        return NextResponse.json({
            inbox: toOwnerInbox(inbox, publicOrigin(request.headers, request.url)),
            uploads: uploads.map((u) => ({
                id: u.id,
                name: u.fileName,
                path: u.path,
                size: String(u.size),
                senderName: u.senderName,
                createdAt: u.createdAt,
            })),
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (err: unknown) {
        logerror("[inbox GET failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// Body: any InboxInput fields; `closed: true/false` pauses or reopens, `password: null` removes it
export async function PATCH(request: Request, { params }: Params) {
    const user = await getRequestUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

        const inbox = await updateInbox(user, (await params).id, body);
        if (!inbox) return NextResponse.json(NOT_FOUND, { status: 404 });
        return NextResponse.json({ inbox: toOwnerInbox(inbox, publicOrigin(request.headers, request.url)) });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[inbox PATCH failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// Removes the link; files already received stay in the folder
export async function DELETE(_request: Request, { params }: Params) {
    const user = await getRequestUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        if (!(await deleteInbox(user.id, (await params).id))) return NextResponse.json(NOT_FOUND, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        logerror("[inbox DELETE failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
