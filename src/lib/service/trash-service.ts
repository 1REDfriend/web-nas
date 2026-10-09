import fs from "fs-extra";
import path from "path";
import { TrashShedule } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FileItem } from "@/components/file-manager/config";
import {
    AccessUser,
    AuthorizedPath,
    FileAccessError,
    authorizeNewEntry,
    physicalToVirtual,
} from "@/lib/security/path-guard";
import { recordRecent } from "@/lib/service/tracked-paths";

// A trashed entry lives in the user's trash folder as "<original name>_id<record id>"
// and has a TrashShedule row describing where it came from.

function recordIdOf(itemName: string): string | null {
    const index = itemName.lastIndexOf("_id");
    return index > 0 ? itemName.slice(index + 3) || null : null;
}

async function findRecord(userId: string, itemName: string): Promise<TrashShedule | null> {
    const id = recordIdOf(itemName);
    if (!id) return null;

    const record = await prisma.trashShedule.findFirst({ where: { id, userId } });
    // The file name must match the record, so a renamed or foreign file is never trusted
    return record && `${record.item}_id${record.id}` === itemName ? record : null;
}

// Older records only stored the path on disk at delete time
async function originalPathOf(record: TrashShedule): Promise<string | null> {
    return record.originalPath ?? (await physicalToVirtual(record.returnPath));
}

// Shows trash items under their original name, with where they came from
export async function describeTrashItems(userId: string, items: FileItem[]): Promise<FileItem[]> {
    return Promise.all(items.map(async (item) => {
        const record = await findRecord(userId, item.name);
        if (!record) return item;

        return {
            ...item,
            name: record.item,
            // The on-disk name ends in "_id<id>", so take the type from the original name
            type: item.type === "directory" ? "directory" : path.extname(record.item).replace(".", "") || "file",
            originalPath: await originalPathOf(record),
            expiresAt: record.expireDate.toISOString(),
        };
    }));
}

// "report.pdf" -> "report (restored).pdf", then "report (restored 2).pdf", ...
function restoredName(name: string, attempt: number): string {
    const ext = path.extname(name);
    const base = ext && ext !== name ? name.slice(0, -ext.length) : name;
    const suffix = attempt === 1 ? " (restored)" : ` (restored ${attempt})`;
    return `${base}${suffix}${ext && ext !== name ? ext : ""}`;
}

export async function restoreFromTrash(
    user: AccessUser,
    trash: { physicalPath: string; itemName: string | null }
): Promise<AuthorizedPath> {
    if (!trash.itemName) {
        throw new FileAccessError("Choose an item in the trash to restore", 400);
    }

    const record = await findRecord(user.id, trash.itemName);
    if (!record || !(await fs.pathExists(trash.physicalPath))) {
        throw new FileAccessError("This item can no longer be restored", 404);
    }

    const originalPath = await originalPathOf(record);
    if (!originalPath || originalPath === "/") {
        throw new FileAccessError("The original location of this item is unknown", 409);
    }

    const folder = path.posix.dirname(originalPath);

    // Same checks as creating a new file there now: the user must still be allowed
    // to write into the original folder (assigned folders, protected-folder rules)
    let target = await authorizeNewEntry(user, folder, record.item);
    for (let attempt = 1; await fs.pathExists(target.physicalPath); attempt++) {
        if (attempt > 50) throw new FileAccessError("Too many items with this name already exist", 409);
        target = await authorizeNewEntry(user, folder, restoredName(record.item, attempt));
    }

    await fs.ensureDir(path.dirname(target.physicalPath));
    await fs.move(trash.physicalPath, target.physicalPath, { overwrite: false });
    await prisma.trashShedule.delete({ where: { id: record.id } });
    await recordRecent(user.id, target.virtualPath, "restored");

    return target;
}
