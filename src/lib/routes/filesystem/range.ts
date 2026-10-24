// Range header parsing shared by media previews and downloads

export type ByteRange = { start: number; end: number };

// Parses a single "bytes=" range. undefined = no/ignored header, null = unsatisfiable.
export function parseRange(header: string | null, size: number): ByteRange | null | undefined {
    if (!header) return undefined;

    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    // Multiple ranges or another unit: serve the whole file instead
    if (!match || (!match[1] && !match[2])) return undefined;

    let start: number;
    let end: number;

    if (!match[1]) {
        // "bytes=-500" means the last 500 bytes
        const suffix = Number(match[2]);
        if (suffix === 0) return null;
        start = Math.max(size - suffix, 0);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }

    if (start >= size || start > end) return null;
    return { start, end };
}
