import { logerror } from "./logger";

export async function pathReplaceValidate(basePath: string): Promise<string | null> {
    try {
        if (!basePath) return null;

        let normalizedPath = basePath.replace(/\\/g, "/");
        if (!normalizedPath.startsWith("/")) {
            normalizedPath = "/" + normalizedPath
        }

        return normalizedPath;

    } catch (err : unknown) {
        logerror("Path validation error:", err)
        return null;
    }
}