import { prisma } from "@/lib/db"
import { ENV } from "@/lib/ENV"
import { logerror } from "@/lib/logger"
import { pathReplaceValidate } from "@/lib/reosolvePath"

export async function verifyUserPath(
    userId: string,
    rawPath: string
) {
    try {
        const validatedPath = await pathReplaceValidate(rawPath)
        const validatedUserId = await pathReplaceValidate(userId)

        const internalPathCheck = ENV.STORAGE_INTERNAL + validatedUserId
        if (validatedPath.startsWith(internalPathCheck)) {
            return true
        }

        const pathDefine = await prisma.pathMap.findMany({
            where: { userId: userId }
        })

        if (!pathDefine.length) return false

        for (const map of pathDefine) {
            const validatedRootPath = await pathReplaceValidate(map.rootPath)

            if (rawPath.startsWith(ENV.STORAGE_ROOT + validatedRootPath)) {
                return true
            }

            if (validatedPath.startsWith(validatedRootPath)) {
                return true
            }
        }

        return false
    } catch (err: unknown) {
        logerror("verifyUserPath Error:", err)
        return false
    }
}