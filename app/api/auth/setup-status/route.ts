import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";

// Public: tells the login screen whether the first admin still needs to be created
export async function GET() {
    try {
        const count = await prisma.user.count();
        return NextResponse.json({ needsSetup: count === 0 });
    } catch (err: unknown) {
        logerror("[setup status failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
