import { logerror } from "@/lib/logger";

export async function userLoginCheck() {
    try {
        const setup = await fetch("/api/auth/setup-status");
        if (setup.ok && (await setup.json()).needsSetup) {
            return { login: false, registor: true, mustChangePassword: false }
        }

        const res = await fetch("/api/auth/user-check")
        if (!res.ok) return { login: false, registor: false, mustChangePassword: false }

        const data = await res.json()
        return { login: true, registor: false, mustChangePassword: data.mustChangePassword === true }
    } catch {
        logerror("[Failed to fetch user login check]")
        return { login: false, registor: false, mustChangePassword: false }
    }
}
