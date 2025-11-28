export async function pathReplaceValidate(basePath: string, rootPrefix?: string): Promise<string> {
    let normalizedPath = basePath.replace(/\\/g, "/");

    if (!normalizedPath.startsWith("/")) {
        normalizedPath = "/" + normalizedPath;
    }

    if (rootPrefix) {
        const prefixToCheck = rootPrefix.startsWith("/") ? rootPrefix : `/${rootPrefix}`;

        if (normalizedPath === prefixToCheck || normalizedPath === `${prefixToCheck}/`) {
            return "/";
        }

        if (normalizedPath.startsWith(`${prefixToCheck}/`)) {
            normalizedPath = normalizedPath.substring(prefixToCheck.length);
        }
    }

    if (!normalizedPath) return "/";
    if (!normalizedPath.startsWith("/")) {
        normalizedPath = "/" + normalizedPath;
    }

    return normalizedPath;
}