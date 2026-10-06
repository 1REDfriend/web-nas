import { NextResponse } from "next/server";
import { prisma } from '@/lib/db';
import { log, logerror } from "@/lib/logger";
import { hashPassword, validatePassword, validateUsername } from "@/lib/security/credentials";

// First-run setup only: creates the first account as ADMIN. Once any user
// exists, accounts are created by an admin via /api/admin/user/create.
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { username, password } = body;

        const problem = validateUsername(username) ?? validatePassword(password);
        if (problem) {
            return NextResponse.json({ error: problem }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);

        const created = await prisma.$transaction(async (tx) => {
            if ((await tx.user.count()) > 0) return null;

            return tx.user.create({
                data: {
                    username,
                    passwordHash,
                    role: 'ADMIN',
                }
            });
        });

        if (!created) {
            return NextResponse.json(
                { error: 'Registration is closed. Ask an admin to create your account.' },
                { status: 403 }
            );
        }

        log("First admin registered : " + username);

        return NextResponse.json(
            { message: 'Admin account created' },
            { status: 201 }
        );
    } catch (err: unknown) {
        logerror("[Registor User Failed] : " + err);
        return NextResponse.json(
            { error: 'Internal Error.' },
            { status: 500 }
        )
    }
}
