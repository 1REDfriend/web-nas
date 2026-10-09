import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { getRequestUser } from "@/lib/security/path-guard";
import { isRuleRole } from "@/lib/security/file-actions";
import { generateTempPassword, hashPassword, validateUsername } from "@/lib/security/credentials";

export async function POST(req: Request) {
    try {
        const requester = await getRequestUser();
        if (!requester) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (requester.role !== "ADMIN") {
            return NextResponse.json(
                { error: "Forbidden: You do not have permission to create users." },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const { username, role } = body;

        const usernameProblem = validateUsername(username);
        if (usernameProblem) {
            return NextResponse.json({ error: usernameProblem }, { status: 400 });
        }

        if (!isRuleRole(role)) {
            return NextResponse.json({ error: "Role must be ADMIN, USER or GUEST." }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({
            where: { username },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: "Username already exists." },
                { status: 409 }
            );
        }

        const tempPassword = generateTempPassword();

        const newUser = await prisma.user.create({
            data: {
                username,
                passwordHash: await hashPassword(tempPassword),
                role,
                // The admin has seen this password, so the user must replace it
                mustChangePassword: true,
            },
        });

        return NextResponse.json({
            message: "User created successfully",
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role,
                tempPassword,
            },
        }, { status: 201 });

    } catch (error) {
        logerror("Create User Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
