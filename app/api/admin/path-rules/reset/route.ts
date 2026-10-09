import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { getRequestUser } from "@/lib/security/path-guard";
import { ensureDefaultPathRules, restoreDefaultPathRules } from "@/lib/security/path-rules";

// Restores every built-in rule to its original settings. Custom rules are not touched.
export async function POST() {
    const user = await getRequestUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
        return NextResponse.json({ error: "Only ADMIN can manage protected folders" }, { status: 403 });
    }

    try {
        await ensureDefaultPathRules();
        await restoreDefaultPathRules();
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        logerror("[path rules reset failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
