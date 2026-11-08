import { chunkedUpload } from "@/lib/api/chunked-upload";
import type { MediaKind } from "@/lib/file-manager/media";

// Browser side of PIN rooms (/p). Everything but the admin calls works without login;
// the server knows the room from the HttpOnly wn_pin cookie.

export type PinLimits = {
    roomBytes: string;
    fileBytes: string;
    maxItems: number;
    noteChars: number;
    roomMinutes: number;
};

export type PinItem = {
    id: string;
    kind: "file" | "note";
    name: string | null;
    size: string;
    text: string | null;
    createdAt: string;
    preview: MediaKind | null;
    canDelete: boolean;
};

export type PinRoom = {
    pin: string;
    version: number;
    expiresAt: string;
    locked: boolean;
    isCreator: boolean;
    usedBytes: string;
    itemCount: number;
    limits: PinLimits;
    items?: PinItem[];
    unchanged?: true;
};

export class PinError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

async function readJson<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new PinError(body?.error || `Request failed (${response.status})`, response.status);
    return body as T;
}

const json = (method: string, body: unknown = {}): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

// null when PIN rooms are turned off
export async function fetchPinStatus(): Promise<{ limits: PinLimits } | null> {
    const response = await fetch("/api/public/pin", { cache: "no-store" });
    if (response.status === 404) return null;
    return readJson(response);
}

// null when this browser is not in an open room
export async function fetchPinRoom(version?: number): Promise<PinRoom | null> {
    const query = version === undefined ? "" : `?v=${version}`;
    const response = await fetch(`/api/public/pin/room${query}`, { cache: "no-store" });
    if (response.status === 404) return null;
    return readJson(response);
}

export async function createPinRoom(): Promise<PinRoom> {
    return readJson(await fetch("/api/public/pin/rooms", json("POST")));
}

export async function joinPinRoom(pin: string): Promise<PinRoom> {
    return readJson(await fetch("/api/public/pin/join", json("POST", { pin })));
}

export async function leavePinRoom(): Promise<void> {
    await readJson(await fetch("/api/public/pin/room/leave", json("POST")));
}

export async function closePinRoom(): Promise<void> {
    await readJson(await fetch("/api/public/pin/room", { method: "DELETE" }));
}

export async function lockPinRoom(locked: boolean): Promise<PinRoom> {
    return readJson(await fetch("/api/public/pin/room", json("PATCH", { locked })));
}

export async function addPinNote(text: string): Promise<PinRoom> {
    return readJson(await fetch("/api/public/pin/room/notes", json("POST", { text })));
}

export async function deletePinItem(id: string): Promise<void> {
    await readJson(await fetch(`/api/public/pin/room/items/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export function pinItemUrl(id: string, raw = false): string {
    return `/api/public/pin/room/items/${encodeURIComponent(id)}${raw ? "/raw" : ""}`;
}

// Every file goes through the piece upload, small ones as a single piece
export function uploadToPinRoom(file: File, onProgress: (percent: number) => void) {
    return chunkedUpload<{ item: { id: string; name: string; size: number } }>("pin", file, {}, onProgress);
}

// --- admin ---

export type PinSettings = {
    enabled: boolean;
    roomMB: number;
    fileMB: number;
    maxItems: number;
    roomMinutes: number;
    roomsPerIp: number;
    totalMB: number;
};

export type AdminPinRoom = {
    id: string;
    pin: string;
    createdAt: string;
    expiresAt: string;
    locked: boolean;
    usedBytes: string;
    itemCount: number;
    creatorIp: string;
};

export type PinAdminData = { settings: PinSettings; rooms: AdminPinRoom[]; usage: { rooms: number; bytes: string } };

export async function fetchPinAdmin(): Promise<PinAdminData> {
    return readJson(await fetch("/api/admin/pin", { cache: "no-store" }));
}

export async function savePinAdmin(settings: Partial<PinSettings>): Promise<PinAdminData> {
    return readJson(await fetch("/api/admin/pin", json("PUT", settings)));
}

export async function adminClosePinRoom(id: string): Promise<void> {
    await readJson(await fetch(`/api/admin/pin/rooms/${encodeURIComponent(id)}`, { method: "DELETE" }));
}
