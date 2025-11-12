import path from 'path';

export function sanitizePath(baseDir: string, userPath: string): string {
    const fullPath = path.resolve(baseDir, userPath);

    if (!fullPath.startsWith(baseDir)) {
        throw new Error('Access Denied: Path is outside the allowed directory.');
    }
    return fullPath;
}