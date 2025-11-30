import { prisma } from "@/lib/db"
import { logerror } from "@/lib/logger"

export async function firstLogin() {
    try {
        const count = await prisma.user.count()

        if (count > 0) {
            return false
        } 

        return true
    } catch (err : unknown) {
        logerror("[get is first user failed] : ", err)
        return null
    }
}