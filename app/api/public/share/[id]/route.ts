import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { FileItem } from "@/components/file-manager/config";
import { getFileStats } from "@/lib/utils/fs-helper";
import { fileAccessErrorResponse } from "@/lib/security/path-guard";
import { resolveShare, resolveSharedEntry } from "@/lib/security/share-access";

// Public (no login): lists what a share link exposes. `path` is relative to the shared root.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const resolved = await resolveShare(id);
        const entry = await resolveSharedEntry(resolved, new URL(request.url).searchParams.get("path") ?? "/");

        let data: FileItem[];

        if ((await fs.stat(entry.physicalPath)).isDirectory()) {
            const names = await fs.readdir(entry.physicalPath);
            const items = await Promise.all(names.map((name) => getFileStats(entry.physicalPath, name, entry.subPath)));
            data = items.filter((f): f is FileItem => f !== null);

            if (!resolved.share.recursive) {
                data = data.filter((f) => f.type !== "directory");
            }
        } else {
            const item = await getFileStats(path.dirname(entry.physicalPath), path.basename(entry.physicalPath), "/");
            data = item ? [{ ...item, path: entry.subPath }] : [];
        }

        if (entry.subPath === "/") {
            await prisma.shareLink
                .update({ where: { id: resolved.share.id }, data: { view: { increment: 1 } } })
                .catch(() => undefined);
        }

        return NextResponse.json({
            share: {
                name: path.posix.basename(resolved.root.virtualPath) || "/",
                isDirectory: resolved.isDirectory,
                recursive: resolved.share.recursive,
                expireAt: resolved.share.expireAt,
            },
            path: entry.subPath,
            data,
        });
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[public share list failed] :", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
