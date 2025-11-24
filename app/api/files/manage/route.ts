import { NextResponse } from "next/server";
import { logerror } from "@/lib/logger";
import { getSafePath } from "@/lib/utils/filesystem/utils";
import { renameAction } from "@/lib/utils/filesystem/actions/rename";
import { moveAction } from "@/lib/utils/filesystem/actions/move";
import { copyAction } from "@/lib/utils/filesystem/actions/copy";
import { placeAction } from "@/lib/utils/filesystem/actions/place";
import { deleteAction } from "@/lib/utils/filesystem/actions/delete";

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

    try {
        if (!reqFile) {
            return NextResponse.json({ error: "No File Select" }, { status: 400 });
        }

        const safeFilePath = getSafePath(reqFile);

        let body: FileActionBody = {};
        try { body = await request.json() as FileActionBody; } catch (e) { }

        let result;

        switch (reqOption) {
            case "rename":
                result = await renameAction(safeFilePath, body.newName || "");
                break;

            case "moveTo":
            case "cut":
                result = await moveAction(safeFilePath, body.destination || "");
                break;

            case "copy":
                result = await copyAction(safeFilePath, body.destination || "");
                break;

            case "place":
                result = await placeAction(safeFilePath, body.type || "", body.content || "");
                break;

            case "delete":
                result = await deleteAction(safeFilePath);
                break;

            default:
                return NextResponse.json({ error: "Invalid operation specified" }, { status: 400 });
        }

        return NextResponse.json({ success: true, ...result });

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logerror("[Manage File Failed] : " + errorMessage);

        const isUserError = errorMessage.includes("Invalid") || errorMessage.includes("No destination") || errorMessage.includes("Access denied");

        return NextResponse.json(
            { error: errorMessage || "Internal Error" },
            { status: isUserError ? 400 : 500 }
        );
    }
}