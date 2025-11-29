import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { log, logerror } from "@/lib/logger";
import { pathReplaceValidate } from "@/lib/reosolvePath";
import { getSafePath } from "@/lib/filesystem/utils";
import { normalizeFsPath } from "@/lib/utils/fs-helper";
import fs from "fs-extra";
import { NextResponse } from "next/server";

export async function POST(request:Request) {
    const body = await request.json()
    const { path, name } = body;

    if (!path || !name) {
        return NextResponse.json(
            { error: "No path found"},
            { status : 400}
        )
    }

    try {
        const userPayload = await xUserPayload();
        const userId = userPayload?.sub

        if (!userId) {
            return NextResponse.json(
                { error: "Unaurtherization"},
                { status: 401}
            )
        }

        createFolder(path, name);

        return NextResponse.json(
            { success: true, message: "Create folder Successful"}
        )
    } catch (err : unknown) {
        logerror("[folder create Failed] :", err)
        return NextResponse.json(
            { error : "Internal Error"},
            { status: 500}
        )
    }
}

async function createFolder(path : string, name: string) {
    const nameNormal = normalizeFsPath(name)
    const pathNormal = normalizeFsPath(path)
    const validatePath = await pathReplaceValidate(pathNormal + nameNormal)

    const fullPath = getSafePath(validatePath || "")
    log("[Create Folder Path] :", fullPath)
    fs.ensureDir(fullPath)
}