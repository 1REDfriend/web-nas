import path from "path";
import fs from "fs-extra";
import { Transform } from "stream";
import { log } from "@/lib/logger";
import { recordRecent } from "@/lib/service/tracked-paths";
import { saveUploadedFile } from "@/lib/service/upload-service";
import { AuthorizedPath, FileAccessError, authorizeNewEntry } from "@/lib/security/path-guard";
import { getClientIp } from "@/lib/security/rate-limit";
import { sessionTokenFromCookieHeader } from "@/lib/security/session";
import { ApiCaller, assertCallerTarget, callerFromPayload, callerLabel, requireCallerScope } from "./caller";
import { V1AuthResult, authenticateV1 } from "./auth";

// Shared by the two /api/v1 upload routes. Both bypass proxy.ts (it would buffer the
// whole body in memory), so they authenticate here and never trust x-user-payload.

export type UploadAuth =
    | { ok: true; caller: ApiCaller }
    | Extract<V1AuthResult, { ok: false }>;

export async function authenticateUpload(headers: Headers): Promise<UploadAuth> {
    const result = await authenticateV1({
        authorization: headers.get("authorization"),
        sessionToken: sessionTokenFromCookieHeader(headers.get("cookie")),
        ip: getClientIp({ headers }),
    });
    if (!result.ok) return result;

    const caller = await callerFromPayload(result.payload);
    if (!caller) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Authentication required." };
    return { ok: true, caller };
}

export type UploadRequest = {
    // Folder to save into
    dir: string;
    name: string;
    overwrite: boolean;
    // Create missing folders on the way (default); false = the folder must exist
    mkdirs: boolean;
};

// Every check that can run before the body is read, so a refused upload is not received first
export async function preflightUpload(caller: ApiCaller, request: UploadRequest): Promise<AuthorizedPath> {
    requireCallerScope(caller, "upload");
    const target = await authorizeNewEntry(caller.user, request.dir, request.name);
    await checkTarget(caller, target, request);
    return target;
}

async function checkTarget(caller: ApiCaller, target: AuthorizedPath, request: UploadRequest) {
    await assertCallerTarget(caller, target, false);

    if (!request.mkdirs && !(await fs.pathExists(path.dirname(target.physicalPath)))) {
        throw new FileAccessError("Folder does not exist (send mkdirs=1 to create it)", 404);
    }

    const existing = await fs.stat(target.physicalPath).catch(() => null);
    if (existing?.isDirectory()) throw new FileAccessError("A folder with that name already exists", 409);
    if (existing && !request.overwrite) {
        throw new FileAccessError("A file with that name already exists (send overwrite=1 to replace it)", 409);
    }
    return existing !== null;
}

export async function saveForCaller(caller: ApiCaller, request: UploadRequest, tempPath: string) {
    let overwritten = false;
    const target = await saveUploadedFile({
        user: caller.user,
        dir: request.dir,
        fileName: request.name,
        tempPath,
        overwrite: request.overwrite,
        assertTarget: async (t) => {
            overwritten = await checkTarget(caller, t, request);
        },
    });

    const size = (await fs.stat(target.physicalPath)).size;
    log(`[API] ${callerLabel(caller)} upload ${target.virtualPath} (${size} bytes${overwritten ? ", replaced" : ""})`);
    await recordRecent(caller.user.id, target.virtualPath, "uploaded");
    return { path: target.virtualPath, size, overwritten };
}

// Counts bytes on the way through and stops the stream past the cap
export function byteLimit(maxBytes: number, message = "File size exceeds limit") {
    let seen = 0;
    return new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            seen += chunk.length;
            if (seen > maxBytes) return callback(new FileAccessError(message, 413));
            callback(null, chunk);
        },
    });
}
