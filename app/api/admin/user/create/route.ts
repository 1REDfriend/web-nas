import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

import bcrypt from "bcrypt";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import generateRandomPassword from "@/lib/utils/passwordGenerator";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { username, role } = body;

        const userPayload = await xUserPayload()
        if (!userPayload) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const userId = userPayload.sub

        const user = await prisma.user.findUnique({
            where: {id: userId}
        })

        if (!user) {
            return NextResponse.json(
                { error : "Fuck U"},
                { status: 500}
            )
        }

        if (user.role !== "ADMIN") {
            return NextResponse.json(
                { message: "Forbidden: You do not have permission to create users." },
                { status: 403 }
            );
        }

        if (!username || !role) {
            return NextResponse.json(
                { message: "Username and Role are required." },
                { status: 400 }
            );
        }

        const existingUser = await prisma.user.findUnique({
            where: { username },
        });

        if (existingUser) {
            return NextResponse.json(
                { message: "Username already exists." },
                { status: 409 }
            );
        }

        const rawPassword = generateRandomPassword(6);

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(rawPassword, saltRounds);

        const newUser = await prisma.user.create({
            data: {
                username,
                passwordHash,
                role: role,
            },
        });

        return NextResponse.json({
            message: "User created successfully",
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role,
                tempPassword: rawPassword,
            },
        }, { status: 201 });

    } catch (error) {
        console.error("Create User Error:", error);
        return NextResponse.json(
            { message: "Internal Server Error" },
            { status: 500 }
        );
    }
}
