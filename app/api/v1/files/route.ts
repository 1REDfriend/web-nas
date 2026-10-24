import path from "path";
import fs from "fs-extra";
import { log } from "@/lib/logger";
import { getApiCaller, authorizeForCaller, callerLabel, requireCallerScope } from "@/lib/api/v1/caller";
import { apiError, apiErrorFromException, apiOk } from "@/lib/api/v1/response";
import { statOr404, toApiEntry } from "@/lib/api/v1/entries";
import { getUserRootPaths } from "@/lib/service/user-path-service";
import { moveToTrashAction } from "@/lib/routes/filesystem/actions/delete";
import { FileAccessError, joinVirtual } from "@/lib/security/path-guard";

const MAX_LIMIT = 1000;
const SORT_KEYS = ["name", "size", "modified"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function intParam(value: string | null, fallback: number, min: number, max: number) {
    const n = value === null ? fallback : Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

// GET /api/v1/files?path=/folder  (scope: list)
// Without ?path: the key's folder, or for unlocked callers the folders assigned to the user
export async function GET(request: Request) {
    try {
        const caller = await getApiCaller();
        if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required");
        requireCallerScope(caller, "list");

        const params = new URL(request.url).searchParams;
        const rawPath = params.get("path") || caller.rootPath;

        if (!rawPath) {
            const roots = await getUserRootPaths(caller.user.id);
            return apiOk({
                path: null,
                entries: roots.map((root) => ({ name: root.name, path: root.path, type: "folder", available: root.available })),
                total: roots.length,
            });
        }

        const page = intParam(params.get("page"), 1, 1, Number.MAX_SAFE_INTEGER);
        const limit = intParam(params.get("limit"), 100, 1, MAX_LIMIT);
        const sortParam = params.get("sort") ?? "name";
        if (!SORT_KEYS.includes(sortParam as SortKey)) {
            return apiError(400, "BAD_REQUEST", `sort must be one of: ${SORT_KEYS.join(", ")}`);
        }
        const sort = sortParam as SortKey;
        const desc = params.get("order") === "desc";

        const folder = await authorizeForCaller(caller, rawPath, "VIEW");
        const folderStats = await statOr404(folder.physicalPath);
        if (!folderStats.isDirectory()) {
            return apiError(400, "BAD_REQUEST", "Path is not a folder");
        }

        const names = await fs.readdir(folder.physicalPath);
        const entries = (
            await Promise.all(
                names.map(async (name) => {
                    // An entry that vanished or is a broken link is skipped, as in the file browser
                    const stats = await fs.stat(path.join(folder.physicalPath, name)).catch(() => null);
                    return stats ? toApiEntry(joinVirtual(folder.virtualPath, name), stats) : null;
                })
            )
        ).filter((entry) => entry !== null);

        entries.sort((a, b) => {
            let diff = 0;
            if (sort === "size") diff = (a.size ?? -1) - (b.size ?? -1);
            if (sort === "modified") diff = a.modifiedAt.localeCompare(b.modifiedAt);
            if (diff === 0) diff = a.name.localeCompare(b.name);
            return desc ? -diff : diff;
        });

        const start = (page - 1) * limit;
        return apiOk({
            path: folder.virtualPath,
            entries: entries.slice(start, start + limit),
            total: entries.length,
            page,
            limit,
        });
    } catch (err: unknown) {
        return apiErrorFromException(err, "list");
    }
}

// DELETE /api/v1/files?path=/folder/file.txt  (scope: delete)
// Moves the file or folder to its owner's trash; nothing is deleted for good.
export async function DELETE(request: Request) {
    try {
        const caller = await getApiCaller();
        if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required");
        requireCallerScope(caller, "delete");

        const rawPath = new URL(request.url).searchParams.get("path");
        if (!rawPath) return apiError(400, "BAD_REQUEST", "path is required");

        const target = await authorizeForCaller(caller, rawPath, "DELETE", { allowKeyRoot: false });
        if (!(await fs.pathExists(target.physicalPath))) {
            throw new FileAccessError("Path not found", 404);
        }

        const result = await moveToTrashAction(caller.user.id, target);
        if ("success" in result && result.success === false) {
            return apiError(500, "INTERNAL", result.error ?? "Failed to delete");
        }

        log(`[API] ${callerLabel(caller)} delete ${target.virtualPath}`);
        return apiOk({ path: target.virtualPath, movedToTrash: true });
    } catch (err: unknown) {
        return apiErrorFromException(err, "delete");
    }
}
