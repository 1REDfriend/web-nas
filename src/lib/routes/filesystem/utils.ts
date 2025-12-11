import path from 'path';
import { ENV } from "@/lib/ENV";

export const getSafePath = (userPath: string): string => {
    const cleaned = userPath.trim().replace(/^[\\/]+/, "").replace(/\\/g, "/");
    const resolvedPath = path.resolve(ENV.STORAGE_ROOT, cleaned);

    const rootWithSep = ENV.STORAGE_ROOT.endsWith(path.sep)
        ? ENV.STORAGE_ROOT
        : ENV.STORAGE_ROOT + path.sep;

    if (!(resolvedPath === ENV.STORAGE_ROOT || resolvedPath.startsWith(rootWithSep))) {
        throw new Error("Invalid path: Access denied.");
    }

    return resolvedPath;
};