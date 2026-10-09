import { FileItem } from "@/components/file-manager/config";

export async function getShareLink() {
    try {
        const res = await fetch('/api/user/share', {
            method: 'GET',
            headers: {
                "Content-Type": "application/json",
            }
        })

        if (!res.ok) return { error: "Failed to get share list" }
        const data = await res.json()

        return data
    } catch {
        return { error: "Failed to get share list" }
    }
}

export async function createShareLink(filePath: string, expireAt?: Date | null, recursive: boolean = false) {
    try {
        const res = await fetch('/api/user/share', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                path: filePath,
                expireAt: expireAt,
                recursive: recursive
            })
        })

        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            return { error: data.error || "Failed to create share" }
        }
        const data = await res.json()

        return data
    } catch {
        return { error: "Failed to create share" }
    }
}

export async function deleteShareLink(id : string) {
    try {
        const res = await fetch(`/api/user/share?id=${id}`, {
            method: 'DELETE',
            headers: {
                "Content-Type": "application/json",
            },
        })

        if (!res.ok) return { error: "Failed to delete share" }
        const data = await res.json()

        return data
    } catch {
        return { error: "Failed to delete share" }
    }
}

export type PublicShareResponse = {
    share: {
        name: string;
        isDirectory: boolean;
        recursive: boolean;
        expireAt: string | null;
    };
    path: string;
    data: FileItem[];
};

// Public endpoint: works without login
export async function fetchPublicShare(id: string, subPath: string = "/"): Promise<PublicShareResponse | { error: string }> {
    try {
        const params = new URLSearchParams({ path: subPath });
        const res = await fetch(`/api/public/share/${encodeURIComponent(id)}?${params.toString()}`)
        const data = await res.json()

        if (!res.ok) return { error: data.error || "Failed to fetch share" }
        return data as PublicShareResponse
    } catch {
        return { error: "Failed to fetch share" }
    }
}

export function publicShareDownloadUrl(id: string, subPath: string): string {
    const params = new URLSearchParams({ path: subPath });
    return `/api/public/share/${encodeURIComponent(id)}/download?${params.toString()}`
}
