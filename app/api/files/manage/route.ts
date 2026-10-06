import { NextResponse } from "next/server";
import path from "path";
import { log, logerror } from "@/lib/logger";
import { renameAction } from "@/lib/routes/filesystem/actions/rename";
import { moveAction } from "@/lib/routes/filesystem/actions/move";
import { copyAction } from "@/lib/routes/filesystem/actions/copy";
import { placeAction } from "@/lib/routes/filesystem/actions/place";
import { deleteFromTrashAction, moveToTrashAction } from "@/lib/routes/filesystem/actions/delete";
import { recordRecent } from "@/lib/service/tracked-paths";
import {
    authorizeNewEntry,
    authorizePath,
    fileAccessErrorResponse,
    getRequestUser,
    isTrashPath,
    joinVirtual,
    normalizeVirtualPath,
    resolveTrashPath,
    validateEntryName,
} from "@/lib/security/path-guard";

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

    const user = await getRequestUser();

    if (!user) {
        return NextResponse.json({ error: "No user Found" }, { status: 401 });
    }

    try {
        if (!reqFile) {
            return NextResponse.json({ error: "No File Select" }, { status: 400 });
        }

        let body: FileActionBody = {};
        try { body = await request.json() as FileActionBody; } catch { }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any;

        switch (reqOption) {
            case "rename": {
                const source = await authorizePath(user, reqFile, "RENAME");
                const target = await authorizePath(
                    user,
                    joinVirtual(path.posix.dirname(source.virtualPath), validateEntryName(body.newName)),
                    "RENAME"
                );
                result = await renameAction(user.id, source, target);
                break;
            }

            case "moveTo":
            case "cut": {
                const source = await authorizePath(user, reqFile, "MOVE");
                const target = await authorizeNewEntry(user, body.destination ?? "", path.posix.basename(source.virtualPath));

                if (source.virtualPath === target.virtualPath) {
                    return NextResponse.json({ error: "Source and destination are the same" }, { status: 400 });
                }

                log(`[Manage] Cut: ${source.virtualPath} -> ${target.virtualPath}`);
                result = await moveAction(user.id, source, target);
                break;
            }

            case "copy": {
                const source = await authorizePath(user, reqFile, "DOWNLOAD", { includeSubtree: true });
                const target = await authorizeNewEntry(user, body.destination ?? "", path.posix.basename(source.virtualPath));

                log(`[Manage] Copy: ${source.virtualPath} -> ${target.virtualPath}`);
                result = await copyAction(source, target);
                await recordRecent(user.id, target.virtualPath, "copied");
                break;
            }

            case "place": {
                const requested = normalizeVirtualPath(reqFile);
                const target = await authorizeNewEntry(
                    user,
                    path.posix.dirname(requested),
                    path.posix.basename(requested)
                );
                result = await placeAction(target, body.type || "", body.content || "");
                await recordRecent(user.id, target.virtualPath, "created");
                break;
            }

            case "delete": {
                if (isTrashPath(reqFile)) {
                    result = await deleteFromTrashAction(user.id, resolveTrashPath(user.id, reqFile), reqConfirm);
                    if (result.error === "Require Confirm") {
                        return NextResponse.json({ success: false, error: result.error }, { status: 409 });
                    }
                } else {
                    result = await moveToTrashAction(user.id, await authorizePath(user, reqFile, "DELETE"));
                }
                break;
            }

            default:
                return NextResponse.json({ error: "Invalid operation specified" }, { status: 400 });
        }

        if (!result.success && result.error) {
            throw new Error(result.error);
        }

        return NextResponse.json({ success: true, ...result });

    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        const errorMessage = err instanceof Error ? err.message : String(err);
        logerror("[Manage File Failed] : " + errorMessage);

        return NextResponse.json(
            { error: errorMessage || "Internal Error", success: false },
            { status: 500 }
        );
    }
}
