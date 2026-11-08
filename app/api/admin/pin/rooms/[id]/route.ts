import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { deleteRoomById } from "@/lib/pin/rooms";

// ADMIN only: closes one PIN room now, deleting everything in it
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getRequestUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Only ADMIN can close PIN rooms" }, { status: 403 });

    try {
        const { id } = await params;
        await deleteRoomById(id);
        return NextResponse.json({ closed: true });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;
        logerror("[pin room DELETE failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
