import { logerror } from "@/lib/logger";
import { firstLogin } from "../auth/first-login";

export async function userLoginCheck() {
    try {
        const res = await fetch("/api/auth/user-check", {
            method: 'GET',
            headers: {
                "Content-Type": "application/json",
            }
        })

        if (await firstLogin()) {
            return {login: false, registor: true}
        } 

        if (res.ok) return {login: true, registor: false}
        else return {login: false, registor: false}
    } catch {
        logerror("[Failed to fetch user login check]")
        return {login: false, registor: false}
    }
}