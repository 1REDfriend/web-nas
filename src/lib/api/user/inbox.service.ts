// Browser calls for upload links (inboxes): the owner's settings page, the admin
// page, and the public page people send files from.

export type InboxStatus = "open" | "closed" | "full" | "expired";

export type InboxInfo = {
    id: string;
    slug: string | null;
    url: string;
    title: string;
    description: string | null;
    targetPath: string;
    splitBySender: boolean;
    requireName: boolean;
    showReceived: boolean;
    allowedExt: string | null;
    maxFileBytes: string | null;
    maxTotalBytes: string | null;
    maxFiles: number | null;
    hasPassword: boolean;
    usedBytes: string;
    fileCount: number;
    expiresAt: string | null;
    closedAt: string | null;
    createdAt: string;
    status: InboxStatus;
};

export type InboxList = {
    inboxes: InboxInfo[];
    canCreate: boolean;
    enabled: boolean;
    allowNoExpiry: boolean;
    defaults: { expiresInDays: number; maxFileMB: number; maxTotalMB: number };
    quota: { usedBytes: number; limitBytes: number | null };
    origin: string;
};

export type InboxReceipt = {
    id: string;
    name: string;
    path: string;
    size: string;
    senderName: string | null;
    createdAt: string;
};

// What the owner sends to create or change a link. Leave a field out to keep it;
// null means "no limit" (or "no password", "no expiry").
export type InboxInput = Partial<{
    title: string;
    description: string | null;
    targetPath: string;
    slug: string | null;
    expiresInDays: number | null;
    maxFileMB: number | null;
    maxTotalMB: number | null;
    maxFiles: number | null;
    allowedExt: string | null;
    password: string | null;
    requireName: boolean;
    splitBySender: boolean;
    showReceived: boolean;
    closed: boolean;
}>;

export type InboxAdminSettings = {
    settings: { enabled: boolean; roles: ("ADMIN" | "USER" | "GUEST")[]; quotaMB: number; allowNoExpiry: boolean };
    inboxes: (InboxInfo & { owner: string })[];
};

export type PublicInbox = {
    title: string;
    description: string | null;
    needsPassword: boolean;
    locked: boolean;
    status: InboxStatus;
    expiresAt: string | null;
    // Only once unlocked
    requireName?: boolean;
    allowedExt?: string[] | null;
    maxFileBytes?: string | null;
    bytesLeft?: string | null;
    filesLeft?: number | null;
    received?: { name: string; size: string; createdAt: string }[] | null;
};

async function readJson(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
}

function sendJson(method: string, body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function fetchInboxes(): Promise<InboxList> {
    return readJson(await fetch("/api/user/inboxes", { cache: "no-store" }));
}

export async function createInboxRequest(input: InboxInput): Promise<InboxInfo> {
    return (await readJson(await fetch("/api/user/inboxes", sendJson("POST", input)))).inbox;
}

export async function updateInboxRequest(id: string, input: InboxInput): Promise<InboxInfo> {
    return (await readJson(await fetch(`/api/user/inboxes/${encodeURIComponent(id)}`, sendJson("PATCH", input)))).inbox;
}

export async function deleteInboxRequest(id: string): Promise<void> {
    await readJson(await fetch(`/api/user/inboxes/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function fetchInboxReceipts(id: string): Promise<{ inbox: InboxInfo; uploads: InboxReceipt[] }> {
    return readJson(await fetch(`/api/user/inboxes/${encodeURIComponent(id)}`, { cache: "no-store" }));
}

export async function fetchInboxAdmin(): Promise<InboxAdminSettings> {
    return readJson(await fetch("/api/admin/inboxes", { cache: "no-store" }));
}

export async function saveInboxAdmin(body: Partial<InboxAdminSettings["settings"]>): Promise<InboxAdminSettings> {
    return readJson(await fetch("/api/admin/inboxes", sendJson("PUT", body)));
}

export async function adminCloseInbox(id: string, closed: boolean): Promise<void> {
    await readJson(await fetch(`/api/admin/inboxes/${encodeURIComponent(id)}`, sendJson("PATCH", { closed })));
}

// --- public page ---

function publicApi(link: string, part = "") {
    return `/api/public/inbox/${encodeURIComponent(link)}${part}`;
}

export async function fetchPublicInbox(link: string): Promise<PublicInbox> {
    return (await readJson(await fetch(publicApi(link), { cache: "no-store" }))).inbox;
}

export async function unlockPublicInbox(link: string, password: string): Promise<PublicInbox> {
    return (await readJson(await fetch(publicApi(link, "/unlock"), sendJson("POST", { password })))).inbox;
}

// XMLHttpRequest instead of fetch: it reports upload progress.
// The name and sender go in the query string so the server can refuse them before the file is sent.
export function sendToInbox(
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
    xhr.open("POST", `/api/public/inbox-upload?${params}`);
    xhr.send(form);

    return { promise, cancel: () => xhr.abort() };
}
