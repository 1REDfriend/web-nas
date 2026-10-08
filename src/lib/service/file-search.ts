import fs from "fs";
import path from "path";
import { FileItem } from "@/components/file-manager/config";
import { getFileStats } from "@/lib/utils/fs-helper";
import { AccessUser, authorizePath, createViewChecker } from "@/lib/security/path-guard";

// Name search through a folder and everything below it.
//
// Bounded so a large disk cannot tie the server up: it stops at the first of
// MAX_RESULTS matches, MAX_SCANNED entries, TIME_LIMIT_MS, or the client going
// away. Breadth-first, so matches near the top come first. Symlinks are never
// followed (no escaping the storage area, no loops), and folders the user may
// not view are skipped just like when browsing.

const MAX_RESULTS = 200;
const MAX_SCANNED = 50_000;
const TIME_LIMIT_MS = 8_000;

export type SearchResult = { data: FileItem[]; truncated: boolean };

export async function searchFiles(
    user: AccessUser,
    startPaths: string[],
    query: string,
    signal?: AbortSignal
): Promise<SearchResult> {
    const needle = query.trim().toLowerCase();
    if (!needle) return { data: [], truncated: false };

    const checker = await createViewChecker(user);
    const deadline = Date.now() + TIME_LIMIT_MS;

    const queue: string[] = [];
    for (const start of startPaths) {
        try {
            const { physicalPath } = await authorizePath(user, start, "VIEW");
            // Nested start folders would otherwise be walked twice
            if (!queue.some((q) => physicalPath === q || physicalPath.startsWith(q + path.sep))) {
                queue.push(physicalPath);
            }
        } catch {
            // A start folder the user cannot see is simply not searched
        }
    }

    const data: FileItem[] = [];
    let scanned = 0;

    while (queue.length > 0) {
        if (signal?.aborted) break;
        const dir = queue.shift()!;

        let handle: fs.Dir;
        try {
            handle = await fs.promises.opendir(dir);
        } catch {
            continue; // unreadable or vanished folder
        }

        for await (const entry of handle) {
            if (++scanned > MAX_SCANNED || Date.now() > deadline || signal?.aborted) {
                return { data, truncated: true };
            }
            if (entry.isSymbolicLink()) continue;

            const physicalPath = path.join(dir, entry.name);
            if (!checker.canView(physicalPath)) continue;

            if (entry.isDirectory()) queue.push(physicalPath);

            if (entry.name.toLowerCase().includes(needle)) {
                const item = await getFileStats(dir, entry.name, checker.toVirtual(dir));
                if (item) data.push(item);
                if (data.length >= MAX_RESULTS) return { data, truncated: true };
            }
        }
    }

    return { data, truncated: signal?.aborted === true };
}
