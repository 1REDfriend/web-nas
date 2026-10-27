import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { callerLabel, getApiCaller } from "@/lib/api/v1/caller";
import { apiError, apiErrorFromException, apiOk } from "@/lib/api/v1/response";
import { assertCanDrop, publicOrigin, toApiDrop } from "@/lib/api/v1/drops";
import { getDropLimits, getDropRequestSettings } from "@/lib/drops/settings";
import {
    REQUEST_DEFAULTS,
    createRequest,
    deleteRequest,
    findOwnRequest,
    listOwnRequests,
    toOwnerRequest,
    updateRequest,
} from "@/lib/drops/requests";

// Drop requests: links that let people without an account send files to the
// caller. Every file received becomes one of the caller's drops.  (scope: drop)
//
// GET    /api/v1/drops/requests          the caller's requests, and what they may set
// GET    /api/v1/drops/requests?id=...   one request with the drops it received that are still live (newest first)
// POST   /api/v1/drops/requests          create; JSON body, see RequestInput in src/lib/drops/requests.ts
// PATCH  /api/v1/drops/requests?id=...   change; fields left out stay, `closed` pauses, `password: null` removes it
// DELETE /api/v1/drops/requests?id=...   delete the link; the drops it received stay until they expire

const NOT_FOUND = "Drop request not found";
const RECEIVED_SHOWN = 200;

async function readBody(request: Request) {
    const body = await request.json().catch(() => null);
    return body && typeof body === "object" ? body : null;
}

export async function GET(request: Request) {
    const caller = await getApiCaller();
    if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required.");

    try {
        assertCanDrop(caller);
        const origin = publicOrigin(request.headers, request.url);
        const id = new URL(request.url).searchParams.get("id");

        if (id) {
            const found = await findOwnRequest(caller.user.id, id);
            if (!found) return apiError(404, "NOT_FOUND", NOT_FOUND);
            const received = await prisma.drop.findMany({
                where: { requestId: found.id, deletedAt: null, completedAt: { not: null }, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: "desc" },
                take: RECEIVED_SHOWN,
            });
            return apiOk({ request: toOwnerRequest(found, origin), received: received.map((d) => toApiDrop(d, origin)) });
        }

        const [requests, settings, limits] = await Promise.all([
            listOwnRequests(caller.user.id),
            getDropRequestSettings(),
            getDropLimits(),
        ]);
        return apiOk({
            requests: requests.map((r) => toOwnerRequest(r, origin)),
            canCreate: settings.enabled && settings.roles.includes(caller.user.role),
            enabled: settings.enabled,
            allowNoExpiry: settings.allowNoExpiry,
            defaults: { ...REQUEST_DEFAULTS, keepHours: limits.maxHours },
            maxKeepHours: limits.maxHours,
        });
    } catch (err: unknown) {
        return apiErrorFromException(err, "drop requests list");
    }
}

export async function POST(request: Request) {
    const caller = await getApiCaller();
    if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required.");

    try {
        assertCanDrop(caller);
        const body = await readBody(request);
        if (!body) return apiError(400, "BAD_REQUEST", "Invalid request body");

        const created = await createRequest(caller.user, body);
        log(`[API] ${callerLabel(caller)} created drop request ${created.id}`);
        return apiOk(toOwnerRequest(created, publicOrigin(request.headers, request.url)), { status: 201 });
    } catch (err: unknown) {
        return apiErrorFromException(err, "drop request create");
    }
}

export async function PATCH(request: Request) {
    const caller = await getApiCaller();
    if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required.");

    try {
        assertCanDrop(caller);
        const body = await readBody(request);
        if (!body) return apiError(400, "BAD_REQUEST", "Invalid request body");

        const updated = await updateRequest(caller.user, new URL(request.url).searchParams.get("id"), body);
        if (!updated) return apiError(404, "NOT_FOUND", NOT_FOUND);
        return apiOk(toOwnerRequest(updated, publicOrigin(request.headers, request.url)));
    } catch (err: unknown) {
        return apiErrorFromException(err, "drop request update");
    }
}

export async function DELETE(request: Request) {
    const caller = await getApiCaller();
    if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required.");

    try {
        assertCanDrop(caller);
        const id = new URL(request.url).searchParams.get("id");
        if (!(await deleteRequest(caller.user.id, id))) return apiError(404, "NOT_FOUND", NOT_FOUND);
        log(`[API] ${callerLabel(caller)} deleted drop request ${id}`);
        return apiOk({ id, removed: true });
    } catch (err: unknown) {
        return apiErrorFromException(err, "drop request delete");
    }
}
