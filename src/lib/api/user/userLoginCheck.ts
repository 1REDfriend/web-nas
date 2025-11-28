import { logerror } from "@/lib/logger";

export async function userLoginCheck() {
    try {
        const res = await fetch("/api/auth/user-check", {
            method: 'GET',
            headers: {
                "Content-Type": "application/json",
            }
        })

        if (res.ok) return true
        else return false
    } catch {
        logerror("[Failed to fetch user login check]")
        return false
    }
}