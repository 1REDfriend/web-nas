import { NextResponse } from "next/server";
import { log, logerror, logwarn } from "@/lib/logger";
import { getSafePath } from "@/lib/filesystem/utils";
import { renameAction } from "@/lib/filesystem/actions/rename";
import { moveAction } from "@/lib/filesystem/actions/move";
import { copyAction } from "@/lib/filesystem/actions/copy";
import { placeAction } from "@/lib/filesystem/actions/place";
import { deleteAction } from "@/lib/filesystem/actions/delete";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { verifyUserPath } from "@/lib/utils/user/verifyUserPath";
import { pathReplaceValidate } from "@/lib/reosolvePath";

interface FileActionBody {
    newName?: string;
    destination?: string;
    type?: string;
    content?: string;
}

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqFile = searchParams.get('file');
    const reqOption = searchParams.get('option');
    const reqConfirm = searchParams.get('confirm') === 'true';

    const userPayload = await xUserPayload();

    if (!userPayload) {
        return NextResponse.json({ error: "No user Found" }, { status: 401 });
    }

    const userId = userPayload.sub;

    try {
        if (!reqFile) {
            return NextResponse.json({ error: "No File Select" }, { status: 400 });
        }

        if (!await verifyUserPath(userId, reqFile)) {
            logwarn("[Manage file Failed] : file not allowed");
            return NextResponse.json({ error: "File path not allowed" }, { status: 400 });
        }

        let body: FileActionBody = {};
        try { body = await request.json() as FileActionBody; } catch { }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any;

        switch (reqOption) {
            case "rename":
                result = await renameAction(getSafePath(reqFile), body.newName || "");
                break;

            case "moveTo":
            case "cut":
                const cutSrcPath = await pathReplaceValidate(reqFile);
                const cutDestPath = await pathReplaceValidate(body.destination || "");

                if (cutSrcPath === cutDestPath) {
                    return NextResponse.json({ error: "Source and destination are the same" }, { status: 400 });
                }

                log(`[Manage Debug] Cut: ${cutSrcPath} -> ${cutDestPath}`);
                result = await moveAction(userId, cutSrcPath, cutDestPath);
                break;

            case "copy":
                const srcPath = await pathReplaceValidate(reqFile);
                const destPath = await pathReplaceValidate(body.destination || "");
                log(`[Manage Debug] Copy: ${srcPath} -> ${destPath}`);
                result = await copyAction(getSafePath(srcPath), destPath);
                break;

            case "place":
                result = await placeAction(getSafePath(reqFile), body.type || "", body.content || "");
                break;

            case "delete":
                result = await deleteAction(userId, getSafePath(reqFile), reqFile, reqConfirm);
                break;

            default:
                return NextResponse.json({ error: "Invalid operation specified" }, { status: 400 });
        }

        if (!result.success && result.error) {
            throw new Error(result.error);
        }

        return NextResponse.json({ success: true, ...result });

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logerror("[Manage File Failed] : " + errorMessage);

        return NextResponse.json(
            { error: errorMessage || "Internal Error", success: false },
            { status: 500 }
        );
    }
}