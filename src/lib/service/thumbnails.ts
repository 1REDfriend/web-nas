import fs from "fs-extra";
import path from "path";
import { createHash, randomBytes } from "crypto";
import sharp from "sharp";
import { ENV } from "@/lib/ENV";

// Small WebP previews for the file grid, cached under STORAGE_INTERNAL/thumbs.
// The cache key includes size and modification time, so an edited image gets
// a new thumbnail. Generation is limited so a folder full of photos cannot
// tie up the CPU, and pixel limits stop decompression bombs.

// Only these sizes exist, so requests cannot fill the cache with arbitrary ones.
// "small" is a square crop for list rows and grid cards; "large" keeps the
// image's shape for the large-icons view.
export const THUMB_SIZES = {
    small: { width: 256, height: 256, fit: "cover" },
    large: { width: 800, height: 800, fit: "inside" },
} as const;
export type ThumbSize = keyof typeof THUMB_SIZES;

export function isThumbSize(value: string): value is ThumbSize {
    return Object.hasOwn(THUMB_SIZES, value);
}
export const MAX_THUMB_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_INPUT_PIXELS = 100_000_000;
const MAX_CONCURRENT = 3;

// sharp keeps input files open in its cache by default: that holds descriptors on
// every image ever thumbnailed (and locks them on Windows). Results are cached on
// disk instead, so the in-memory cache is not needed.
sharp.cache(false);

export class ThumbnailError extends Error {}

let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (active >= MAX_CONCURRENT) {
        await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
    try {
        return await task();
    } finally {
        active--;
        waiting.shift()?.();
    }
}

// The same image requested twice at once is only generated once
const inFlight = new Map<string, Promise<string>>();

function thumbsDir() {
    return path.resolve(ENV.STORAGE_INTERNAL, "thumbs");
}

export function thumbnailKey(physicalPath: string, stat: fs.Stats, size: ThumbSize = "small"): string {
    // "small" keeps its original key so thumbnails already on disk stay valid
    const sizePart = size === "small" ? "" : `\0${size}`;
    return createHash("sha256").update(`${physicalPath}\0${stat.size}\0${stat.mtimeMs}${sizePart}`).digest("hex");
}

async function generate(physicalPath: string, target: string, size: ThumbSize): Promise<string> {
    const { width, height, fit } = THUMB_SIZES[size];
    const buffer = await withSlot(() =>
        sharp(physicalPath, { limitInputPixels: MAX_INPUT_PIXELS })
            .rotate() // respect EXIF orientation
            .resize(width, height, { fit, withoutEnlargement: true })
            .webp({ quality: 70 })
            .toBuffer()
    ).catch((err: unknown) => {
        throw new ThumbnailError(err instanceof Error ? err.message : String(err));
    });

    await fs.ensureDir(path.dirname(target));
    // Write then rename, so a half-written file is never served
    const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(temp, buffer);
    await fs.rename(temp, target);
    return target;
}

// Returns the path of a cached thumbnail, creating it if needed
export async function getThumbnail(
    physicalPath: string,
    stat: fs.Stats,
    size: ThumbSize = "small",
): Promise<{ file: string; etag: string }> {
    const key = thumbnailKey(physicalPath, stat, size);
    const target = path.join(thumbsDir(), key.slice(0, 2), `${key}.webp`);
    const etag = `"${key.slice(0, 32)}"`;

    if (await fs.pathExists(target)) return { file: target, etag };

    let pending = inFlight.get(key);
    if (!pending) {
        pending = generate(physicalPath, target, size).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
    }
    return { file: await pending, etag };
}
