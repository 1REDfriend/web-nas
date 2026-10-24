import { callerLabel, getApiCaller } from "@/lib/api/v1/caller";
import { apiError, apiErrorFromException, apiOk } from "@/lib/api/v1/response";
import { assertCanDrop, publicOrigin, toApiDrop } from "@/lib/api/v1/drops";
import { findDrop, listDrops, removeDrop } from "@/lib/drops/drops";
import { log } from "@/lib/logger";

// GET    /api/v1/drops          the user's drops that can still be downloaded  (scope: drop)
// GET    /api/v1/drops?id=...   one of them
// DELETE /api/v1/drops?id=...   stop sharing it now; the file is deleted shortly after
// Uploads: PUT /api/v1/drops/raw and POST /api/v1/drops/upload

export async function GET(request: Request) {
    const caller = await getApiCaller();
    if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required.");

    try {
        assertCanDrop(caller);
        const origin = publicOrigin(request.headers, request.url);
        const id = new URL(request.url).searchParams.get("id");

        if (id) {
            const drop = await findDrop(caller.user.id, id);
            if (!drop) return apiError(404, "NOT_FOUND", "Drop not found or expired");
            return apiOk(toApiDrop(drop, origin));
        }

        const drops = await listDrops(caller.user.id);
        return apiOk({ drops: drops.map((drop) => toApiDrop(drop, origin)) });
    } catch (err: unknown) {
        return apiErrorFromException(err, "drops list");
    }
}

export async function DELETE(request: Request) {
    const caller = await getApiCaller();
    if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required.");

    try {
        assertCanDrop(caller);
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return apiError(400, "BAD_REQUEST", "id is required");

        if (!(await removeDrop(caller.user.id, id))) {
            return apiError(404, "NOT_FOUND", "Drop not found or expired");
        }
        log(`[API] ${callerLabel(caller)} removed drop ${id}`);
        return apiOk({ id, removed: true });
    } catch (err: unknown) {
        return apiErrorFromException(err, "drops delete");
    }
}
