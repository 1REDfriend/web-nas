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

        if (!res.ok) return { error: "Failed to create share" }
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

export async function fetchShareLinkId(
    id : string
) {
    try {
        const res = await fetch(`/api/user/share/id?id=${id}`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
        })

        if (!res.ok) return { error: "Failed to fetch share" }
        const data = await res.json()

        return data
    } catch {
        return { error: "Failed to fetch share" }
    }
}