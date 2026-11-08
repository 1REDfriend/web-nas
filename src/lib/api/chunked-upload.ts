// Sends a big file in pieces through /api/uploads, so no single request passes
// Cloudflare's 100 MB cap. Smaller files keep using the one-request upload routes.

const MB = 1024 * 1024;
// Well under Cloudflare's cap and the server's 64 MB per piece
export const PIECE_BYTES = 32 * MB;
const RETRIES = 3;

export type UploadKind = "file" | "drop" | "request" | "pin";

export function needsPieces(file: File): boolean {
    return file.size > PIECE_BYTES;
}

type Body = { ok?: boolean; data?: unknown; error?: string; received?: number };

class UploadError extends Error {
    constructor(message: string, public status: number, public body: Body | null) {
        super(message);
    }
}

function parse(text: string): Body | null {
    try {
        return JSON.parse(text);
    } catch {
        return null; // e.g. a proxy error page
    }
}

function errorFor(status: number, body: Body | null): UploadError {
    if (status === 413 && !body) return new UploadError("The file is too large to upload here.", status, body);
    return new UploadError(body?.error || `Upload failed (${status})`, status, body);
}

// One request; XMLHttpRequest so a piece reports its progress
function send(
    method: string,
    url: string,
    body: Document | XMLHttpRequestBodyInit | null,
    track: { xhr: XMLHttpRequest | null },
    onProgress?: (loaded: number) => void,
    contentType?: string
): Promise<Body> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        track.xhr = xhr;
        xhr.open(method, url);
        if (contentType) xhr.setRequestHeader("Content-Type", contentType);
        if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
        xhr.onload = () => {
            const parsed = parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && parsed?.ok) resolve(parsed);
            else reject(errorFor(xhr.status, parsed));
        };
        xhr.onerror = () => reject(new UploadError("Upload failed. Check your connection and try again.", 0, null));
        xhr.onabort = () => reject(new UploadError("Upload cancelled", -1, null));
        xhr.send(body);
    });
}

// Network errors and server hiccups are worth another try; a refusal is not
const retryable = (err: unknown) => err instanceof UploadError && (err.status === 0 || err.status === 409 || (err.status >= 500 && err.status !== 507));

export function chunkedUpload<T>(
    kind: UploadKind,
    file: File,
    start: Record<string, unknown>,
    onProgress: (percent: number) => void
): { promise: Promise<T>; cancel: () => void } {
    const track: { xhr: XMLHttpRequest | null } = { xhr: null };
    let cancelled = false;
    const url = (params: Record<string, string>) => `/api/uploads?${new URLSearchParams({ kind, ...params })}`;

    const promise = (async () => {
        const started = await send("POST", url({ action: "start" }), JSON.stringify({ ...start, size: file.size, name: file.name }), track, undefined, "application/json");
        const id = (started.data as { id: string }).id;
        let finished = false;

        try {
            let offset = 0;
            let failures = 0;
            while (offset < file.size) {
                if (cancelled) throw new UploadError("Upload cancelled", -1, null);
                const end = Math.min(offset + PIECE_BYTES, file.size);
                try {
                    const result = await send(
                        "PUT",
                        url({ id, offset: String(offset) }),
                        file.slice(offset, end),
                        track,
                        (loaded) => onProgress(Math.min(99, Math.floor(((offset + loaded) / file.size) * 100))),
                        "application/octet-stream"
                    );
                    offset = (result.data as { received: number }).received;
                    failures = 0;
                } catch (err: unknown) {
                    if (cancelled || !retryable(err) || ++failures > RETRIES) throw err;
                    // The server says where it is; otherwise resend the same piece
                    const received = (err as UploadError).body?.received;
                    if (typeof received === "number") offset = received;
                    await new Promise((r) => setTimeout(r, 1000 * failures));
                }
            }

            const done = await send("POST", url({ action: "finish", id }), null, track);
            finished = true;
            onProgress(100);
            return done.data as T;
        } finally {
            // Free what the start reserved (the server would also clean up after an hour)
            if (!finished) void fetch(url({ id }), { method: "DELETE" }).catch(() => undefined);
        }
    })();

    return {
        promise,
        cancel: () => {
            cancelled = true;
            track.xhr?.abort();
        },
    };
}
