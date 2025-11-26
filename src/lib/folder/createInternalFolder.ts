import { ENV } from "../ENV"
import { logerror } from "../logger"
import { pathReplaceValidate } from "../reosolvePath"
import fs from 'fs-extra'

export async function createInternalFolder(userId : string, path: string) {
    if (!userId) {
        return false
    }

    try {
        const InternalPath = ENV.STORAGE_INTERNAL
        const fullPath = InternalPath + await pathReplaceValidate(userId + await pathReplaceValidate(path))

        if (!fullPath) return false

        fs.ensureDir(fullPath)
    } catch (err : unknown) {
        logerror("[create internal folder failed] :", err)
        return false
    }
}