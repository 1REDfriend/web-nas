import type { DropInfo } from "./drop.service";

// Browser calls for drop requests: links that let people send files to you.
// The owner side uses /api/v1/drops/requests (the session is accepted there, like
// for drops); the public page uses /api/public/drop-requests.

export type RequestStatus = "open" | "closed" | "full" | "expired";

export type DropRequestInfo = {
    id: string;
    slug: string | null;
    url: string;
    title: string;
    description: string | null;
    requireName: boolean;
    showReceived: boolean;
    allowedExt: string | null;
    maxFileBytes: string | null;
    maxTotalBytes: string | null;
    maxFiles: number | null;
    keepHours: number;
    hasPassword: boolean;
    usedBytes: string;
    fileCount: number;
    expiresAt: string | null;
    closedAt: string | null;
    createdAt: string;
    status: RequestStatus;
};

export type DropRequestList = {
    requests: DropRequestInfo[];
    canCreate: boolean;
    enabled: boolean;
    allowNoExpiry: boolean;
    defaults: { expiresInDays: number; maxFileMB: number; maxTotalMB: number; keepHours: number };
    maxKeepHours: number;
};

// What the owner sends to create or change a request. Leave a field out to keep it;
// null means "no limit" (or "no password", "no end date").
export type DropRequestInput = Partial<{
    title: string;
    description: string | null;
    slug: string | null;
    expiresInDays: number | null;
    keepHours: number;
    maxFileMB: number | null;
    maxTotalMB: number | null;
    maxFiles: number | null;
    allowedExt: string | null;
    password: string | null;
    requireName: boolean;
    showReceived: boolean;
    closed: boolean;
}>;

export type PublicDropRequest = {
    title: string;
    description: string | null;
    needsPassword: boolean;
    locked: boolean;
    status: RequestStatus;
    expiresAt: string | null;
    // Only once unlocked
    requireName?: boolean;
    allowedExt?: string[] | null;
    maxFileBytes?: string | null;
    bytesLeft?: string | null;
    filesLeft?: number | null;
    received?: { name: string; size: string; createdAt: string }[] | null;
};

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

function sendJson(method: string, body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

const ownApi = (id?: string) => `/api/v1/drops/requests${id ? `?${new URLSearchParams({ id })}` : ""}`;

export async function fetchDropRequests(): Promise<DropRequestList> {
    return readV1(await fetch(ownApi(), { cache: "no-store" }));
}

export async function createDropRequest(input: DropRequestInput): Promise<DropRequestInfo> {
    return readV1(await fetch(ownApi(), sendJson("POST", input)));
}

export async function updateDropRequest(id: string, input: DropRequestInput): Promise<DropRequestInfo> {
    return readV1(await fetch(ownApi(id), sendJson("PATCH", input)));
}

export async function deleteDropRequest(id: string): Promise<void> {
    await readV1(await fetch(ownApi(id), { method: "DELETE" }));
}

export async function fetchReceivedDrops(id: string): Promise<{ request: DropRequestInfo; received: DropInfo[] }> {
    return readV1(await fetch(ownApi(id), { cache: "no-store" }));
}

export async function adminCloseDropRequest(id: string, closed: boolean): Promise<void> {
    await readJson(await fetch(`/api/admin/drops/requests?${new URLSearchParams({ id })}`, sendJson("PATCH", { closed })));
}

// --- public page ---

function publicApi(link: string, part = "") {
    return `/api/public/drop-requests/${encodeURIComponent(link)}${part}`;
}

export async function fetchPublicDropRequest(link: string): Promise<PublicDropRequest> {
    return (await readJson(await fetch(publicApi(link), { cache: "no-store" }))).request;
}

export async function unlockPublicDropRequest(link: string, password: string): Promise<PublicDropRequest> {
    return (await readJson(await fetch(publicApi(link, "/unlock"), sendJson("POST", { password })))).request;
}

// XMLHttpRequest instead of fetch: it reports upload progress.
// The name and sender go in the query string so the server can refuse them before the file is sent.
export function sendToDropRequest(
    link: string,
    file: File,
    sender: string,
    onProgress: (percent: number) => void
): { promise: Promise<{ name: string; size: number }>; cancel: () => void } {
    const xhr = new XMLHttpRequest();
    const params = new URLSearchParams({ id: link, name: file.name });
    if (sender.trim()) params.set("sender", sender.trim());

    const promise = new Promise<{ name: string; size: number }>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
            let body: { ok?: boolean; file?: { name: string; size: number }; error?: string } | null = null;
            try {
                body = JSON.parse(xhr.responseText);
            } catch {
                /* not JSON, e.g. a proxy error page */
            }
            if (xhr.status === 201 && body?.ok && body.file) resolve(body.file);
            else if (xhr.status === 413 && !body) reject(new Error("The file is too large to upload here."));
            else reject(new Error(body?.error || `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
        xhr.onabort = () => reject(new Error("Upload cancelled"));
    });

    const form = new FormData();
    form.append("file", file, file.name);
    xhr.open("POST", `/api/public/drop-request-upload?${params}`);
    xhr.send(form);

    return { promise, cancel: () => xhr.abort() };
}
