import type { DropRequestInfo } from "./drop-request.service";

// Browser calls for drops. The logged-in session is accepted on /api/v1, so the
// page uses the same endpoints as programs with an API key.

export type DropInfo = {
    id: string;
    name: string;
    size: string;
    mimeType: string | null;
    createdAt: string;
    expiresAt: string;
    maxDownloads: number | null;
    downloads: number;
    // Set when someone sent it through one of your drop requests
    requestId: string | null;
    senderName: string | null;
    url: string;
    downloadUrl: string;
};

export type DropList = {
    drops: DropInfo[];
    limits: { defaultHours: number; maxHours: number };
    quota: { usedBytes: number; limitBytes: number | null };
};

export type DropUploadOptions = {
    // "30m", "24h", "7d"; empty = the admin's default
    expiresIn: string;
    maxDownloads: number | null;
};

export type DropSettings = {
    limits: { defaultHours: number; maxHours: number; quotaMB: number };
    folder: { folder: string | null; current: string; default: string };
    usage: { drops: number; bytes: string };
    migration: { running: boolean; lastError: string | null; pending: number };
    requests: {
        settings: DropRequestSettings;
        list: (DropRequestInfo & { owner: string })[];
    };
};

export type DropRequestSettings = { enabled: boolean; roles: ("ADMIN" | "USER" | "GUEST")[]; allowNoExpiry: boolean };

async function readV1(res: Response) {
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Request failed (${res.status})`);
    return body.data;
}

async function readJson(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
}

export async function fetchDrops(): Promise<DropList> {
    return readV1(await fetch("/api/v1/drops", { cache: "no-store" }));
}

export async function removeDropRequest(id: string): Promise<void> {
    await readV1(await fetch(`/api/v1/drops?${new URLSearchParams({ id })}`, { method: "DELETE" }));
}

// XMLHttpRequest instead of fetch: it reports upload progress.
// Options go in the query string so the server can refuse them before the file is sent.
export function uploadDrop(
    file: File,
    options: DropUploadOptions,
    onProgress: (percent: number) => void
): { promise: Promise<DropInfo>; cancel: () => void } {
    const xhr = new XMLHttpRequest();
    const params = new URLSearchParams();
    if (options.expiresIn) params.set("expiresIn", options.expiresIn);
    if (options.maxDownloads !== null) params.set("maxDownloads", String(options.maxDownloads));

    const promise = new Promise<DropInfo>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
            let body: { ok?: boolean; data?: DropInfo; error?: string } | null = null;
            try {
                body = JSON.parse(xhr.responseText);
            } catch {
                /* not JSON, e.g. a proxy error page */
            }
            if (xhr.status === 201 && body?.ok && body.data) resolve(body.data);
            else if (xhr.status === 413 && !body) reject(new Error("The file is too large to upload here."));
            else reject(new Error(body?.error || `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
        xhr.onabort = () => reject(new Error("Upload cancelled"));
    });

    const form = new FormData();
    form.append("file", file, file.name);
    xhr.open("POST", `/api/v1/drops/upload?${params}`);
    xhr.send(form);

    return { promise, cancel: () => xhr.abort() };
}

export async function fetchDropSettings(): Promise<DropSettings> {
    return readJson(await fetch("/api/admin/drops", { cache: "no-store" }));
}

export async function saveDropSettings(body: {
    folder: string | null;
    defaultHours: number;
    maxHours: number;
    quotaMB: number;
    requests?: Partial<DropRequestSettings>;
}): Promise<DropSettings> {
    return readJson(
        await fetch("/api/admin/drops", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
    );
}
