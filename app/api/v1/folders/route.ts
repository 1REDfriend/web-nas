import path from "path";
import fs from "fs-extra";
import { log } from "@/lib/logger";
import { assertCallerTarget, callerLabel, getApiCaller, requireCallerScope } from "@/lib/api/v1/caller";
import { apiError, apiErrorFromException, apiOk } from "@/lib/api/v1/response";
import { recordRecent } from "@/lib/service/tracked-paths";
import { authorizeNewEntry, normalizeVirtualPath } from "@/lib/security/path-guard";

// POST /api/v1/folders  { "path": "/folder/new/sub" }  (scope: upload)
// Creates the folder and any missing parents. An existing folder is not an error.
export async function POST(request: Request) {
    try {
        const caller = await getApiCaller();
        if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required");
        requireCallerScope(caller, "upload");

        const body = await request.json().catch(() => null);
        if (!body || typeof body.path !== "string" || !body.path) {
            return apiError(400, "BAD_REQUEST", "Send JSON with a \"path\" string");
        }

        const virtualPath = normalizeVirtualPath(body.path);
        if (virtualPath === "/") return apiError(400, "BAD_REQUEST", "path must name a folder");

        const target = await authorizeNewEntry(caller.user, path.posix.dirname(virtualPath), path.posix.basename(virtualPath));
        await assertCallerTarget(caller, target);

        const existing = await fs.stat(target.physicalPath).catch(() => null);
        if (existing && !existing.isDirectory()) {
            return apiError(409, "CONFLICT", "A file with that name already exists");
        }
        if (existing) {
            return apiOk({ path: target.virtualPath, created: false });
        }

        await fs.ensureDir(target.physicalPath);
        log(`[API] ${callerLabel(caller)} mkdir ${target.virtualPath}`);
        await recordRecent(caller.user.id, target.virtualPath, "created");
        return apiOk({ path: target.virtualPath, created: true }, { status: 201 });
    } catch (err: unknown) {
        return apiErrorFromException(err, "mkdir");
    }
}
