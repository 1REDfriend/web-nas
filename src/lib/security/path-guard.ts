import path from "path";
import fs from "fs-extra";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ENV } from "@/lib/ENV";
import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { DESTRUCTIVE_ACTIONS, FileAction, WRITE_ACTIONS, parseActions } from "./file-actions";
import { getPathRulesForRole } from "./path-rules";

// Single entry point for every file-system permission check.
//
// A "virtual path" is what the browser sends ("/axite/photos"). It is always
// interpreted relative to STORAGE_ROOT and can never climb above it. Checks run on
// the real path (symlinks resolved), in this order:
//   1. must stay inside STORAGE_ROOT
//   2. system-protected paths (app folder, internal storage, PROTECTED_PATHS) are off limits
//   3. non-admins must stay inside the folders the admin assigned to them (PathMap)
//   4. admin-managed PathRule entries for the user's role

export class FileAccessError extends Error {
    status: number;

    constructor(message: string, status = 403) {
        super(message);
        this.name = "FileAccessError";
        this.status = status;
    }
}

export type AccessUser = { id: string; role: Role };

export type AuthorizedPath = { virtualPath: string; physicalPath: string };

export async function getAccessUser(userId?: string | null): Promise<AccessUser | null> {
    if (!userId) return null;
    return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
    });
}

export async function getRequestUser(): Promise<AccessUser | null> {
    const payload = await xUserPayload();
    return getAccessUser(payload?.sub);
}

export function fileAccessErrorResponse(err: unknown): NextResponse | null {
    if (err instanceof FileAccessError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return null;
}

const NAME_MAX_LENGTH = 255;

export function validateEntryName(name: unknown): string {
    if (typeof name !== "string") throw new FileAccessError("Invalid name", 400);

    const trimmed = name.trim();
    if (
        !trimmed ||
        trimmed.length > NAME_MAX_LENGTH ||
        trimmed === "." ||
        trimmed === ".." ||
        /[\\/\0]/.test(trimmed)
    ) {
        throw new FileAccessError("Invalid name", 400);
    }

    return trimmed;
}

export function normalizeVirtualPath(raw: unknown): string {
    if (typeof raw !== "string" || raw.includes("\0")) {
        throw new FileAccessError("Invalid path", 400);
    }

    // posix.normalize clamps ".." at "/" for absolute paths, so the result can never leave the root
    const normalized = path.posix.normalize("/" + raw.replace(/\\/g, "/"));
    return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function joinVirtual(dir: string, name: string): string {
    return normalizeVirtualPath(path.posix.join(dir, name));
}

export function isInside(child: string, parent: string): boolean {
    const rel = path.relative(parent, child);
    return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
}

// Real path of the deepest existing ancestor, with the not-yet-existing tail appended
async function realpathNearest(target: string): Promise<string> {
    const missing: string[] = [];
    let current = target;

    for (;;) {
        try {
            const real = await fs.realpath(current);
            return path.join(real, ...missing.reverse());
        } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== "ENOENT" && code !== "ENOTDIR") throw err;

            const parent = path.dirname(current);
            if (parent === current) return target;

            missing.push(path.basename(current));
            current = parent;
        }
    }
}

async function getStorageRoot(): Promise<string> {
    if (!ENV.STORAGE_ROOT) {
        throw new FileAccessError("Storage is not configured", 500);
    }
    return realpathNearest(path.resolve(ENV.STORAGE_ROOT));
}

function physicalOf(root: string, virtualPath: string): string {
    return path.join(root, virtualPath);
}

// Turns a path on disk back into the virtual path the UI uses; null if it is
// outside STORAGE_ROOT. Only for paths the server stored itself.
export async function physicalToVirtual(physicalPath: string): Promise<string | null> {
    const root = await getStorageRoot();
    const resolved = path.resolve(physicalPath);
    if (!isInside(resolved, root)) return null;
    return normalizeVirtualPath(path.relative(root, resolved).split(path.sep).join("/"));
}

// Paths no role can touch, not even ADMIN, and that cannot be edited from the UI
export async function getSystemProtectedPaths(): Promise<string[]> {
    const candidates = [
        process.cwd(),
        path.resolve(ENV.STORAGE_INTERNAL),
        ...ENV.PROTECTED_PATHS.map((p) => path.resolve(p)),
    ];
    const resolved = await Promise.all(candidates.map(realpathNearest));
    return [...new Set(resolved)];
}

async function getWritableRoots(): Promise<string[]> {
    return Promise.all(ENV.STORAGE_WRITABLE_PATHS.map((p) => realpathNearest(path.resolve(p))));
}

// Writes must land on persistent storage, and the storage folders themselves
// (and their parents) must never be deleted, renamed or moved
async function assertPersistentLocation(root: string, physicalPath: string, action: FileAction, destructive: boolean) {
    if (!WRITE_ACTIONS.includes(action)) return;

    const writableRoots = await getWritableRoots();
    if (writableRoots.length === 0) return;

    if (destructive && writableRoots.some((w) => isInside(w, physicalPath))) {
        throw new FileAccessError("This is a storage folder and cannot be renamed, moved or deleted");
    }

    if (!writableRoots.some((w) => isInside(physicalPath, w))) {
        const allowed = writableRoots
            .filter((w) => isInside(w, root))
            .map((w) => "/" + path.relative(root, w).split(path.sep).join("/"))
            .join(", ");
        throw new FileAccessError(
            `Files can only be saved on persistent storage (${allowed}). Anything written elsewhere would be lost when the app restarts.`
        );
    }
}

async function getAssignedRoots(user: AccessUser, root: string): Promise<string[]> {
    const pathMaps = await prisma.pathMap.findMany({
        where: { userId: user.id },
        select: { rootPath: true },
    });

    return Promise.all(
        pathMaps.map((m) => realpathNearest(physicalOf(root, normalizeVirtualPath(m.rootPath))))
    );
}

async function assertAssignedFolder(
    user: AccessUser,
    root: string,
    physicalPath: string,
    destructive: boolean
) {
    const assignedRoots = await getAssignedRoots(user, root);

    if (!assignedRoots.some((r) => isInside(physicalPath, r))) {
        throw new FileAccessError("You do not have access to this path");
    }

    if (destructive && assignedRoots.some((r) => r === physicalPath)) {
        throw new FileAccessError("Folders assigned by the admin cannot be renamed, moved or deleted");
    }
}

async function assertPathRules(
    user: AccessUser,
    root: string,
    physicalPath: string,
    action: FileAction,
    checkSubtree: boolean
) {
    const rules = await getPathRulesForRole(user.role);

    for (const rule of rules) {
        if (!parseActions(rule.actions).includes(action)) continue;

        const rulePath = await realpathNearest(physicalOf(root, normalizeVirtualPath(rule.path)));
        const covered = physicalPath === rulePath || (rule.recursive && isInside(physicalPath, rulePath));

        if (covered) {
            throw new FileAccessError(`"${action}" is blocked on ${rule.path} for role ${user.role}`);
        }

        // Deleting, moving, zipping or copying a parent would take the protected folder with it
        if (checkSubtree && isInside(rulePath, physicalPath)) {
            throw new FileAccessError(`This folder contains ${rule.path}, which is protected against "${action}"`);
        }
    }
}

export type AuthorizeOptions = {
    // The action reads or exposes everything inside a folder (zip download, copy, share)
    includeSubtree?: boolean;
};

export async function authorizePath(
    user: AccessUser,
    rawPath: unknown,
    action: FileAction,
    options: AuthorizeOptions = {}
): Promise<AuthorizedPath> {
    const virtualPath = normalizeVirtualPath(rawPath);
    const destructive = DESTRUCTIVE_ACTIONS.includes(action);
    const checkSubtree = destructive || options.includeSubtree === true;

    if (destructive && virtualPath === "/") {
        throw new FileAccessError("The storage root cannot be changed");
    }

    const root = await getStorageRoot();
    const lexicalPath = physicalOf(root, virtualPath);

    // Destructive actions touch the entry itself (a symlink is removed, not its target);
    // everything else touches whatever the path points to.
    const physicalPath = destructive
        ? path.join(await realpathNearest(path.dirname(lexicalPath)), path.basename(lexicalPath))
        : await realpathNearest(lexicalPath);

    if (!isInside(physicalPath, root) || (destructive && physicalPath === root)) {
        throw new FileAccessError("Path is outside the storage area");
    }

    for (const protectedPath of await getSystemProtectedPaths()) {
        if (isInside(physicalPath, protectedPath)) {
            throw new FileAccessError("This path is protected by the system");
        }
        if (checkSubtree && isInside(protectedPath, physicalPath)) {
            throw new FileAccessError("This folder contains a system-protected folder");
        }
    }

    await assertPersistentLocation(root, physicalPath, action, destructive);

    if (user.role !== "ADMIN") {
        await assertAssignedFolder(user, root, physicalPath, destructive);
    }

    await assertPathRules(user, root, physicalPath, action, checkSubtree);

    return { virtualPath, physicalPath };
}

// For walking many entries (search): loads everything authorizePath(…, "VIEW") would
// check once, then answers per real path without touching the database again.
// Only valid for real paths found by walking a folder without following symlinks.
export type ViewChecker = {
    root: string;
    canView: (physicalPath: string) => boolean;
    toVirtual: (physicalPath: string) => string;
};

export async function createViewChecker(user: AccessUser): Promise<ViewChecker> {
    const root = await getStorageRoot();
    const protectedPaths = await getSystemProtectedPaths();
    const assignedRoots = user.role === "ADMIN" ? null : await getAssignedRoots(user, root);

    const viewRules = await Promise.all(
        (await getPathRulesForRole(user.role))
            .filter((rule) => parseActions(rule.actions).includes("VIEW"))
            .map(async (rule) => ({
                path: await realpathNearest(physicalOf(root, normalizeVirtualPath(rule.path))),
                recursive: rule.recursive,
            }))
    );

    return {
        root,
        canView: (physicalPath) =>
            isInside(physicalPath, root) &&
            !protectedPaths.some((p) => isInside(physicalPath, p)) &&
            (assignedRoots === null || assignedRoots.some((r) => isInside(physicalPath, r))) &&
            !viewRules.some((r) => physicalPath === r.path || (r.recursive && isInside(physicalPath, r.path))),
        toVirtual: (physicalPath) =>
            normalizeVirtualPath(path.relative(root, physicalPath).split(path.sep).join("/")),
    };
}

// Authorizes creating `name` inside `dir` (upload, new folder, paste target)
export async function authorizeNewEntry(
    user: AccessUser,
    rawDir: unknown,
    rawName: unknown
): Promise<AuthorizedPath> {
    const name = validateEntryName(rawName);
    const dir = await authorizePath(user, rawDir, "UPLOAD");
    return authorizePath(user, joinVirtual(dir.virtualPath, name), "UPLOAD");
}

// --- Trash: "/trash/<item>" maps to the user's own internal trash folder ---

export function isTrashPath(raw: unknown): boolean {
    try {
        const virtualPath = normalizeVirtualPath(raw);
        return virtualPath === "/trash" || virtualPath.startsWith("/trash/");
    } catch {
        return false;
    }
}

export function getUserTrashDir(userId: string): string {
    return path.resolve(ENV.STORAGE_INTERNAL, userId, "trash");
}

export function resolveTrashPath(
    userId: string,
    raw: unknown
): { trashDir: string; physicalPath: string; itemName: string | null } {
    const virtualPath = normalizeVirtualPath(raw);
    if (virtualPath !== "/trash" && !virtualPath.startsWith("/trash/")) {
        throw new FileAccessError("Not a trash path", 400);
    }

    const trashDir = getUserTrashDir(userId);
    const rest = virtualPath.slice("/trash".length).replace(/^\//, "");

    if (!rest) {
        return { trashDir, physicalPath: trashDir, itemName: null };
    }

    // Trash items are flat: a nested path here can only be an escape attempt
    const itemName = validateEntryName(rest);
    return { trashDir, physicalPath: path.join(trashDir, itemName), itemName };
}
