import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import {
    FILE_ACTIONS,
    RULE_ROLES,
    isFileAction,
    isRuleRole,
    parseActions,
    serializeActions,
} from "@/lib/security/file-actions";
import {
    fileAccessErrorResponse,
    getRequestUser,
    getSystemProtectedPaths,
    normalizeVirtualPath,
} from "@/lib/security/path-guard";
import { ensureDefaultPathRules } from "@/lib/security/path-rules";

async function requireAdmin() {
    const user = await getRequestUser();
    if (!user) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    if (user.role !== "ADMIN") {
        return { error: NextResponse.json({ error: "Only ADMIN can manage protected folders" }, { status: 403 }) };
    }
    return { user };
}

export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        await ensureDefaultPathRules();

        const rules = await prisma.pathRule.findMany({
            orderBy: [{ path: "asc" }, { role: "asc" }],
        });

        return NextResponse.json({
            rules: rules.map((r) => ({ ...r, actions: parseActions(r.actions) })),
            actions: FILE_ACTIONS,
            roles: RULE_ROLES,
            systemProtected: await getSystemProtectedPaths(),
        });
    } catch (err: unknown) {
        logerror("[path rules GET failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// Creates or replaces the rule for one (path, role) pair
export async function POST(request: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        const body = await request.json();
        const { path: rawPath, role, actions, recursive, note } = body ?? {};

        if (!isRuleRole(role)) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }

        if (!Array.isArray(actions) || actions.length === 0 || !actions.every(isFileAction)) {
            return NextResponse.json({ error: "Select at least one action to block" }, { status: 400 });
        }

        const path = normalizeVirtualPath(rawPath);
        const data = {
            actions: serializeActions(actions),
            recursive: recursive !== false,
            note: typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null,
            isDefault: false,
        };

        await ensureDefaultPathRules();

        const rule = await prisma.pathRule.upsert({
            where: { idx_path_role_unique: { path, role } },
            update: data,
            create: { path, role, ...data },
        });

        return NextResponse.json({
            success: true,
            rule: { ...rule, actions: parseActions(rule.actions) },
        });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[path rules POST failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "Rule id is required" }, { status: 400 });
    }

    try {
        const { count } = await prisma.pathRule.deleteMany({ where: { id } });
        if (count === 0) {
            return NextResponse.json({ error: "Rule not found" }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        logerror("[path rules DELETE failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
