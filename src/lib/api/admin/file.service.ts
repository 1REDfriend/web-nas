import { logerror } from "@/lib/logger";

export async function getImport(
    userId?: string,
    reqPath?: string
) {
    if (!userId || !reqPath) {
        try {
            const res = await fetch('/api/admin/files/get-import', {
                method: 'GET'
            })

            const data = await res.json()

            if (!res.ok) {
                logerror("[Get Import Failed] : " + data.error)
                return
            }

            return data
        } catch (err: unknown) {
            logerror("[Get Import Failed] : " + err)
            return
        }
    }

    try {
        const params = new URLSearchParams();
        params.set("path", reqPath)
        params.set("userId", userId)

        const res = await fetch(`/api/admin/files/get-import?${params.toString()}`, {
            method: 'GET',
            headers: {
                "Content-Type": "application/json",
            },
        })

        const data = await res.json()

        if (!res.ok) {
            logerror("[Get Import Failed] : " + data.error)
            return
        }

        return data
    } catch (err: unknown) {
        logerror("[Get Import Failed] : " + err)
        return
    }
}