import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/security/path-guard";

export async function requireInboxAdmin() {
    const user = await getRequestUser();
    if (!user) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    if (user.role !== "ADMIN") {
        return { error: NextResponse.json({ error: "Only ADMIN can manage upload links" }, { status: 403 }) };
    }
    return { user };
}
