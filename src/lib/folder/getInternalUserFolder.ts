import { ENV } from "../ENV";
import { pathReplaceValidate } from "../reosolvePath";

export async function getInternalUserFolder(
    userId: string
) {
    const fullPath = ENV.STORAGE_INTERNAL + await pathReplaceValidate(userId)
    return fullPath
}