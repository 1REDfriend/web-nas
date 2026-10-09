import { logerror } from "@/lib/logger";

export async function passChange(
    oldPass: string,
    newPass: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const res = await fetch("/api/auth/password/old", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ oldPass, newPass }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            return { ok: false, error: data.error || "Failed to change password" };
        }
        return { ok: true };
    } catch (err: unknown) {
        logerror("[Faild to fetch pass-change] : " + err)
        return { ok: false, error: "An error occurred connecting to the server." };
    }
}
