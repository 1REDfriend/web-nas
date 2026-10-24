import path from "path";
import fs from "fs-extra";
import mime from "mime-types";
import { FileAccessError } from "@/lib/security/path-guard";

// The file/folder shape returned by /api/v1 (kept separate from the UI's FileItem
// so the UI can change without breaking programs that call the API)
export type ApiEntry = {
    name: string;
    path: string;
    type: "file" | "folder";
    size: number | null;
    modifiedAt: string;
    mime: string | null;
};

export function toApiEntry(virtualPath: string, stats: fs.Stats): ApiEntry {
    const isFolder = stats.isDirectory();
    return {
        name: path.posix.basename(virtualPath) || "/",
        path: virtualPath,
        type: isFolder ? "folder" : "file",
        size: isFolder ? null : stats.size,
        modifiedAt: stats.mtime.toISOString(),
        mime: isFolder ? null : mime.lookup(virtualPath) || "application/octet-stream",
    };
}

// stat() that turns "missing" into a 404 instead of a 500
export async function statOr404(physicalPath: string): Promise<fs.Stats> {
    try {
        return await fs.stat(physicalPath);
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") throw new FileAccessError("Path not found", 404);
        throw err;
    }
}
