import { log, logerror } from "@/lib/logger";
import {
    authorizeNewEntry,
    fileAccessErrorResponse,
    getRequestUser,
} from "@/lib/security/path-guard";
import fs from "fs-extra";
import { NextResponse } from "next/server";

export async function POST(request:Request) {
    const body = await request.json()
    const { path, name } = body;

    if (typeof path !== "string" || !name) {
        return NextResponse.json(
            { error: "No path found"},
            { status : 400}
        )
    }

    try {
        const user = await getRequestUser();

        if (!user) {
            return NextResponse.json(
                { error: "Unaurtherization"},
                { status: 401}
            )
        }

        const target = await authorizeNewEntry(user, path, name);

        if (await fs.pathExists(target.physicalPath)) {
            return NextResponse.json(
                { error: "An item with that name already exists" },
                { status: 409 }
            )
        }

        log("[Create Folder Path] :", target.virtualPath)
        await fs.ensureDir(target.physicalPath);

        return NextResponse.json(
            { success: true, message: "Create folder Successful"}
        )
    } catch (err : unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[folder create Failed] :", err)
        return NextResponse.json(
            { error : "Internal Error"},
            { status: 500}
        )
    }
}
