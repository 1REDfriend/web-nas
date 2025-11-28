export async function pathReplaceValidate(basePath: string): Promise<string> {
    let normalizedPath = basePath.replace(/\\/g, "/");
    if (!normalizedPath.startsWith("/")) {
        normalizedPath = "/" + normalizedPath
    }

    return normalizedPath;
}