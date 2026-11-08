import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { closeAllRooms, listRoomsForAdmin } from "@/lib/pin/rooms";
import { getPinSettings, savePinSettings, validatePinSettings } from "@/lib/pin/settings";

// ADMIN only: PIN room settings and the rooms open right now

async function requireAdmin() {
    const user = await getRequestUser();
    if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    if (user.role !== "ADMIN") return { error: NextResponse.json({ error: "Only ADMIN can change PIN room settings" }, { status: 403 }) };
    return { user };
}

async function payload() {
    const [settings, rooms] = await Promise.all([getPinSettings(), listRoomsForAdmin()]);
    const usedBytes = rooms.reduce((sum, r) => sum + BigInt(r.usedBytes), BigInt(0));
    return { settings, rooms, usage: { rooms: rooms.length, bytes: String(usedBytes) } };
}

export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;
    try {
        return NextResponse.json(await payload());
    } catch (err: unknown) {
        logerror("[pin settings GET failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// Body: any of { enabled, roomMB, fileMB, maxItems, roomMinutes, roomsPerIp, totalMB }.
// Turning PIN rooms off deletes every open room.
export async function PUT(request: Request) {
    const { error } = await requireAdmin();
    if (error) return error;
    try {
        const body = await request.json().catch(() => null);
        const next = await validatePinSettings(body);
        await savePinSettings(next);
        if (!next.enabled) await closeAllRooms("PIN rooms were turned off");
        return NextResponse.json(await payload());
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;
        logerror("[pin settings PUT failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
