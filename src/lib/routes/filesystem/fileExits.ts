import { prisma } from "@/lib/db"
import { getSafePath } from "./utils"
import fs from 'fs-extra'

export async function fileExitsUser(
    userId: string,
    filePath: string,
) {
    try {
        const pathMap = await prisma.pathMap.findMany({
            where: {userId}
        })

        const exists = pathMap.some(path => filePath.includes(path.rootPath))

        return exists
    } catch {
        return false
    }
}

export async function fileExitsInDir(
    filePath: string
) {
    try {
        const physicalPath = getSafePath(filePath);

        const exits = await fs.exists(physicalPath)

        return exits
    } catch {
        return false
    }
}