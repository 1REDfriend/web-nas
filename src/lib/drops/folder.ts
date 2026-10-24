import path from "path";
import fs from "fs-extra";
import { prisma } from "@/lib/db";
import {
    FileAccessError,
    getFixedProtectedPaths,
    getStorageRoot,
    getWritableRoots,
    isInside,
    normalizeVirtualPath,
    physicalToVirtual,
    realpathNearest,
} from "@/lib/security/path-guard";
import {
    DROPS_FOLDER_KEY,
    DROPS_MARKER,
    currentDropBase,
    dropBaseFor,
    getDropBases,
    getDropFolderSetting,
    invalidateDropBases,
} from "./locations";
import { ensureDropBase, runExclusive, startDropMigration } from "./maintenance";

// Checks a folder an admin wants to keep drops in. The sweeper deletes folders
// inside it, so it must be a folder of its own: missing, empty, or already used for drops.
async function checkNewDropFolder(raw: unknown): Promise<string> {
    const virtualPath = normalizeVirtualPath(raw);
    if (virtualPath === "/") {
        throw new FileAccessError("Pick a folder inside the storage, not the storage root", 400);
    }

    const root = await getStorageRoot();
    const physical = await realpathNearest(path.join(root, virtualPath));
    if (!isInside(physical, root) || physical === root) {
        throw new FileAccessError("The folder must be inside the storage", 400);
    }

    for (const locked of await getFixedProtectedPaths()) {
        if (isInside(physical, locked) || isInside(locked, physical)) {
            throw new FileAccessError("This folder is protected by the system", 400);
        }
    }

    const writable = await getWritableRoots();
    if (writable.length > 0 && !writable.some((w) => isInside(physical, w) && physical !== w)) {
        throw new FileAccessError("The folder must be inside persistent storage, not the storage folder itself", 400);
    }

    for (const base of await Promise.all((await getDropBases()).map(realpathNearest))) {
        if (base !== physical && (isInside(physical, base) || isInside(base, physical))) {
            throw new FileAccessError("The folder cannot be inside a drop folder or contain one", 400);
        }
    }

    const stat = await fs.stat(physical).catch(() => null);
    if (stat) {
        if (!stat.isDirectory()) throw new FileAccessError("That path is a file", 400);
        const entries = await fs.readdir(physical);
        if (entries.length > 0 && !entries.includes(DROPS_MARKER)) {
            throw new FileAccessError("The folder must be empty (or not exist yet)", 409);
        }
    }

    return virtualPath;
}

// Switches where drops are kept (null = back to the default) and starts moving
// the existing ones there. New drops use the new folder at once.
export async function setDropFolder(raw: unknown) {
    const folder = raw === null || raw === "" ? null : await checkNewDropFolder(raw);

    await runExclusive(async () => {
        const previous = await currentDropBase();
        const next = dropBaseFor(folder);
        if (previous === next) return;

        await ensureDropBase(next);
        if (folder) {
            await prisma.appSetting.upsert({
                where: { key: DROPS_FOLDER_KEY },
                create: { key: DROPS_FOLDER_KEY, value: folder },
                update: { value: folder },
            });
        } else {
            await prisma.appSetting.deleteMany({ where: { key: DROPS_FOLDER_KEY } });
        }
        invalidateDropBases();
        startDropMigration(previous);
    });
}

// How the drop folder looks in the settings page
export async function describeDropFolder() {
    const folder = await getDropFolderSetting();
    const label = async (physical: string) => (await physicalToVirtual(physical)) ?? "Internal storage";
    return {
        folder,
        current: await label(dropBaseFor(folder)),
        default: await label(dropBaseFor(null)),
    };
}
