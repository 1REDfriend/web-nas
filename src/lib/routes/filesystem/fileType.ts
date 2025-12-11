import fs from 'fs-extra'

export async function fileType(
    filePath: string
) {
    try {
        const stats = await fs.stat(filePath)
        if (stats.isFile()) {
            return 'file'
        } else if (stats.isDirectory()) {
            return 'folder'
        } else if (stats.isSymbolicLink()) {
            return 'symboticlink'
        }
        return null
    } catch {
        return null
    }
}