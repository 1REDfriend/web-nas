import { logerror } from "@/lib/logger";

export async function passChange(
    username: string,
    oldPass: string,
    newPass: string,
) {

    try {
        const res = await fetch("/api/auth/password/old", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, oldPass, newPass }),
        });

        const data = res.json()

        return data
    } catch (err: unknown) {
        logerror("[Faild to fetch pass-change] : " + err)
        return {}
    }
}