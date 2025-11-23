import { UserJwtPayload } from "@/interfaces/userJwtpayload";
import { logerror } from "@/lib/logger";
import { headers } from "next/headers";

export async function xUserPayload() {
    const headersList = await headers();
    const payloadString = headersList.get('x-user-payload');

    try {
        if (!payloadString) {
            return null
        }

        const userPayload: UserJwtPayload = await JSON.parse(payloadString);
        return userPayload
    } catch (err: unknown) {
        logerror("[x-user-payload decode failed] : " + err)
        return null
    }
}