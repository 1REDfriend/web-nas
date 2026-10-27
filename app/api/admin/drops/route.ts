import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { currentDropBase } from "@/lib/drops/locations";
import { describeDropFolder, setDropFolder } from "@/lib/drops/folder";
import { getMigrationState } from "@/lib/drops/maintenance";
import { getDropLimits, getDropRequestSettings, saveDropLimits, saveDropRequestSettings, validateDropLimits, validateDropRequestSettings } from "@/lib/drops/settings";
import { toOwnerRequest } from "@/lib/drops/requests";
import { publicOrigin } from "@/lib/api/v1/drops";

async function requireAdmin() {
    const user = await getRequestUser();
    if (!user) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    if (user.role !== "ADMIN") {
        return { error: NextResponse.json({ error: "Only ADMIN can change drop settings" }, { status: 403 }) };
    }
    return { user };
}

async function dropSettingsPayload(request: Request) {
    const base = await currentDropBase();
    const [limits, folder, usage, pending, requestSettings, requests] = await Promise.all([
        getDropLimits(),
        describeDropFolder(),
        prisma.drop.aggregate({ where: { deletedAt: null }, _count: true, _sum: { size: true } }),
        prisma.drop.count({ where: { deletedAt: null, baseDir: { not: base } } }),
        getDropRequestSettings(),
        prisma.dropRequest.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { username: true } } } }),
    ]);
    const origin = publicOrigin(request.headers, request.url);

    return {
        limits,
        folder,
        usage: { drops: usage._count, bytes: String(usage._sum.size ?? 0) },
        migration: { ...getMigrationState(), pending },
        requests: {
            settings: requestSettings,
            list: requests.map((r) => ({ ...toOwnerRequest(r, origin), owner: r.user.username })),
        },
    };
}

export async function GET(request: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        return NextResponse.json(await dropSettingsPayload(request));
    } catch (err: unknown) {
        logerror("[drop settings GET failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// Body: any of { folder: string | null, defaultHours, maxHours, quotaMB,
// requests: { enabled, roles, allowNoExpiry } }.
// Everything is checked before anything is saved.
export async function PUT(request: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
        }

        const limits = await validateDropLimits(body);
        const requestSettings = await validateDropRequestSettings(body.requests);
        if ("folder" in body) await setDropFolder(body.folder);
        await saveDropLimits(limits);
        await saveDropRequestSettings(requestSettings);

        return NextResponse.json(await dropSettingsPayload(request));
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[drop settings PUT failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
