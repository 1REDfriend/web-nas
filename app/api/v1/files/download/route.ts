import { log } from "@/lib/logger";
import { getApiCaller, authorizeForCaller, callerLabel, requireCallerScope } from "@/lib/api/v1/caller";
import { apiError, apiErrorFromException } from "@/lib/api/v1/response";
import { statOr404 } from "@/lib/api/v1/entries";
import { createDownloadResponse } from "@/lib/routes/filesystem/download-response";
import { recordRecent } from "@/lib/service/tracked-paths";

// GET /api/v1/files/download?path=/folder/file.txt  (scope: read)
// Files support Range requests; a folder comes back as a zip.
export async function GET(request: Request) {
    try {
        const caller = await getApiCaller();
        if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required");
        requireCallerScope(caller, "read");

        const rawPath = new URL(request.url).searchParams.get("path");
        if (!rawPath) return apiError(400, "BAD_REQUEST", "path is required");

        const target = await authorizeForCaller(caller, rawPath, "DOWNLOAD", { includeSubtree: true });
        const stats = await statOr404(target.physicalPath);
        if (stats.isDirectory() && caller.rootPath !== null) {
            // A zip follows links inside the folder, which could reach past the key's folder
            return apiError(400, "BAD_REQUEST", "Keys locked to a folder can only download files");
        }

        const response = await createDownloadResponse(target.physicalPath, { rangeHeader: request.headers.get("range") });
        log(`[API] ${callerLabel(caller)} download ${target.virtualPath}`);
        await recordRecent(caller.user.id, target.virtualPath, "downloaded");
        return response;
    } catch (err: unknown) {
        return apiErrorFromException(err, "download");
    }
}
