import type { UserJwtPayload } from "@/interfaces/userJwtpayload";
import {
    AccessUser,
    AuthorizeOptions,
    AuthorizedPath,
    FileAccessError,
    authorizePath,
    getAccessUser,
    isInside,
    isTrashPath,
} from "@/lib/security/path-guard";
import { FileAction } from "@/lib/security/file-actions";
import { requireInsideKeyRoot, requireScope } from "@/lib/security/api-key";
import { API_SCOPES, ApiScope, parseScopes } from "@/lib/security/api-key-format";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { DEFAULT_MAX_UPLOAD_BYTES } from "@/lib/service/upload-service";

// Who is calling an /api/v1 route, and the path checks every v1 route goes through.
// Authentication itself happened earlier (proxy.ts or authenticateV1()).
export type ApiCaller = {
    user: AccessUser;
    username: string;
    via: "session" | "apikey";
    keyId: string | null;
    keyPrefix: string | null;
    // Per-key upload cap; null = server default
    maxUploadBytes: number | null;
    scopes: ApiScope[];
    // Virtual path the API key is locked to; null = no extra limit
    rootPath: string | null;
};

export async function callerFromPayload(payload: UserJwtPayload | null): Promise<ApiCaller | null> {
    if (!payload) return null;

    const user = await getAccessUser(payload.sub);
    if (!user) return null;

    if (payload.via === "apikey") {
        if (!payload.keyId) return null;
        return {
            user,
            username: payload.username,
            via: "apikey",
            keyId: payload.keyId,
            keyPrefix: payload.keyPrefix ?? null,
            maxUploadBytes: payload.maxUploadBytes ? Number(payload.maxUploadBytes) : null,
            scopes: parseScopes(payload.scopes ?? []),
            rootPath: payload.keyRoot ?? null,
        };
    }

    // A logged-in browser session can do everything its user can
    return {
        user,
        username: payload.username,
        via: "session",
        keyId: null,
        keyPrefix: null,
        maxUploadBytes: null,
        scopes: [...API_SCOPES],
        rootPath: null,
    };
}

// For routes behind proxy.ts, which passes the checked identity in x-user-payload
export async function getApiCaller(): Promise<ApiCaller | null> {
    return callerFromPayload(await xUserPayload());
}

export function requireCallerScope(caller: ApiCaller, scope: ApiScope) {
    requireScope(caller, scope);
}

// Short label for logs: the key prefix shown in the UI (wnas_<prefix>_...) and its owner
export function callerLabel(caller: ApiCaller): string {
    return caller.keyId ? `key:${caller.keyPrefix ?? caller.keyId} (${caller.username})` : `session:${caller.username}`;
}

// Largest upload this caller may send
export function uploadLimitFor(caller: ApiCaller): number {
    return caller.maxUploadBytes === null ? DEFAULT_MAX_UPLOAD_BYTES : Math.min(caller.maxUploadBytes, DEFAULT_MAX_UPLOAD_BYTES);
}

// Real path of the key's folder, so a symlink inside it cannot lead somewhere else
async function keyRootPhysical(caller: ApiCaller & { rootPath: string }): Promise<string> {
    return (await authorizePath(caller.user, caller.rootPath, "VIEW")).physicalPath;
}

// Checks an already authorized target against the key's folder lock (by real path)
// and keeps the API out of the browser-only trash view.
// allowKeyRoot = false: the key's folder itself is off limits (deleting it, creating it).
export async function assertCallerTarget(caller: ApiCaller, target: AuthorizedPath, allowKeyRoot = true) {
    if (isTrashPath(target.virtualPath)) {
        throw new FileAccessError("The trash is not available through the API", 400);
    }
    if (caller.rootPath === null) return;

    const { rootPath } = caller;
    requireInsideKeyRoot(caller, target.virtualPath);
    const root = await keyRootPhysical({ ...caller, rootPath });
    if (!isInside(target.physicalPath, root) || (!allowKeyRoot && target.physicalPath === root)) {
        throw new FileAccessError("This API key cannot reach that path", 403);
    }
}

export async function authorizeForCaller(
    caller: ApiCaller,
    rawPath: unknown,
    action: FileAction,
    options: AuthorizeOptions & { allowKeyRoot?: boolean } = {}
): Promise<AuthorizedPath> {
    if (isTrashPath(rawPath)) {
        throw new FileAccessError("The trash is not available through the API", 400);
    }
    if (caller.rootPath !== null && typeof rawPath === "string") {
        // Fail fast with a clear message before touching the disk
        requireInsideKeyRoot(caller, rawPath);
    }

    const target = await authorizePath(caller.user, rawPath, action, options);
    await assertCallerTarget(caller, target, options.allowKeyRoot ?? true);
    return target;
}

// Reads ?flag=1 / true / yes
export function boolParam(value: string | null | undefined, fallback: boolean): boolean {
    if (value === null || value === undefined || value === "") return fallback;
    return ["1", "true", "yes"].includes(value.toLowerCase());
}
