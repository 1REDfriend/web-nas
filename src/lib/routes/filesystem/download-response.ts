import fs from "fs-extra";
import path from "path";
import { Readable } from "stream";
import mime from "mime-types";
import archiver from "archiver";

type DownloadOptions = {
    // Zip only the files directly inside the folder (non-recursive shares)
    topLevelFilesOnly?: boolean;
};

function contentDisposition(fileName: string) {
    const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// Streams a file, or a folder as a zip, without loading it into memory
export async function createDownloadResponse(physicalPath: string, options: DownloadOptions = {}) {
    const stats = await fs.stat(physicalPath);
    const headers = new Headers();

    if (stats.isFile()) {
        headers.set("Content-Type", mime.lookup(physicalPath) || "application/octet-stream");
        headers.set("Content-Disposition", contentDisposition(path.basename(physicalPath)));
        headers.set("Content-Length", stats.size.toString());

        const body = Readable.toWeb(fs.createReadStream(physicalPath)) as ReadableStream<Uint8Array>;
        return new Response(body, { status: 200, headers });
    }

    if (stats.isDirectory()) {
        const archive = archiver("zip", { zlib: { level: 9 } });

        if (options.topLevelFilesOnly) {
            archive.glob("*", { cwd: physicalPath, nodir: true, dot: true });
        } else {
            archive.directory(physicalPath, false);
        }
        void archive.finalize();

        headers.set("Content-Type", "application/zip");
        headers.set("Content-Disposition", contentDisposition(`${path.basename(physicalPath)}.zip`));

        const body = Readable.toWeb(archive) as ReadableStream<Uint8Array>;
        return new Response(body, { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Path is not a file or directory" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
    });
}
