import { getApiCaller, authorizeForCaller, requireCallerScope } from "@/lib/api/v1/caller";
import { apiError, apiErrorFromException, apiOk } from "@/lib/api/v1/response";
import { statOr404, toApiEntry } from "@/lib/api/v1/entries";

// GET /api/v1/files/stat?path=/folder/file.txt  (scope: list)
export async function GET(request: Request) {
    try {
        const caller = await getApiCaller();
        if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required");
        requireCallerScope(caller, "list");

        const rawPath = new URL(request.url).searchParams.get("path");
        if (!rawPath) return apiError(400, "BAD_REQUEST", "path is required");

        const target = await authorizeForCaller(caller, rawPath, "VIEW");
        const stats = await statOr404(target.physicalPath);
        return apiOk(toApiEntry(target.virtualPath, stats));
    } catch (err: unknown) {
        return apiErrorFromException(err, "stat");
    }
}
