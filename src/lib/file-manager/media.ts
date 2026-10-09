// Shared between client and server: keep this file free of Node-only imports.
//
// Only these types are ever served inline (shown in the browser) by /api/files/raw.
// Anything that can carry script — HTML, SVG, XML, PDF — is deliberately left out:
// served from our own origin it would run with the viewer's session.

export type MediaKind = "image" | "video" | "audio";

export const MEDIA_TYPES: Record<string, { kind: MediaKind; mime: string }> = {
    ".png": { kind: "image", mime: "image/png" },
    ".jpg": { kind: "image", mime: "image/jpeg" },
    ".jpeg": { kind: "image", mime: "image/jpeg" },
    ".gif": { kind: "image", mime: "image/gif" },
    ".webp": { kind: "image", mime: "image/webp" },
    ".avif": { kind: "image", mime: "image/avif" },
    ".bmp": { kind: "image", mime: "image/bmp" },
    ".ico": { kind: "image", mime: "image/x-icon" },

    ".mp4": { kind: "video", mime: "video/mp4" },
    ".m4v": { kind: "video", mime: "video/mp4" },
    ".webm": { kind: "video", mime: "video/webm" },
    ".mov": { kind: "video", mime: "video/quicktime" },
    ".ogv": { kind: "video", mime: "video/ogg" },

    ".mp3": { kind: "audio", mime: "audio/mpeg" },
    ".m4a": { kind: "audio", mime: "audio/mp4" },
    ".aac": { kind: "audio", mime: "audio/aac" },
    ".wav": { kind: "audio", mime: "audio/wav" },
    ".ogg": { kind: "audio", mime: "audio/ogg" },
    ".oga": { kind: "audio", mime: "audio/ogg" },
    ".flac": { kind: "audio", mime: "audio/flac" },
    ".opus": { kind: "audio", mime: "audio/ogg" },
};

function extensionOf(name: string): string {
    const dot = name.lastIndexOf(".");
    const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
    return dot > slash ? name.slice(dot).toLowerCase() : "";
}

export function mediaTypeOf(name: string): { kind: MediaKind; mime: string } | null {
    return MEDIA_TYPES[extensionOf(name)] ?? null;
}

export function rawFileUrl(path: string): string {
    return `/api/files/raw?${new URLSearchParams({ file: path }).toString()}`;
}

export function thumbnailUrl(path: string): string {
    return `/api/files/thumb?${new URLSearchParams({ file: path }).toString()}`;
}

// Share-link versions (public, no login). `subPath` is relative to the shared root.
export function shareRawUrl(shareId: string, subPath: string): string {
    return `/api/public/share/${encodeURIComponent(shareId)}/raw?${new URLSearchParams({ path: subPath }).toString()}`;
}

export function shareThumbnailUrl(shareId: string, subPath: string): string {
    return `/api/public/share/${encodeURIComponent(shareId)}/thumb?${new URLSearchParams({ path: subPath }).toString()}`;
}
