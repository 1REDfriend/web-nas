import { readdir } from 'fs-extra';
import { getFileStats } from '../../lib/utils/fs-helper';

type SortOption = 'name' | 'size' | 'date';
type OrderOption = 'asc' | 'desc';

interface BrowseOptions {
    physicalPath: string;
    reqPath: string;
    page: number;
    limit: number;
    search: string;
    sortBy: SortOption;
    order: OrderOption;
}

export async function getDirectoryFiles({
    physicalPath,
    reqPath,
    page,
    limit,
    search,
    sortBy,
    order
}: BrowseOptions) {

    // 1. อ่านไฟล์ทั้งหมด
    let files = await readdir(physicalPath);

    // 2. Filter ตาม Search
    if (search) {
        files = files.filter(file =>
            file.toLowerCase().includes(search.toLowerCase())
        );
    }

    const totalFiles = files.length;
    let resultFiles = [];

    // 3. Sorting & Pagination Logic
    // กรณี Sort by Name: ทำ Pagination ก่อน แล้วค่อยดึง Stats (ประหยัด resource)
    if (sortBy === 'name') {
        files.sort((a, b) => {
            return order === 'asc'
                ? a.localeCompare(b)
                : b.localeCompare(a);
        });

        const startIndex = (page - 1) * limit;
        const paginatedFiles = files.slice(startIndex, startIndex + limit);

        resultFiles = await Promise.all(
            paginatedFiles.map(async (file) => {
                return await getFileStats(physicalPath, file, reqPath);
            })
        );
    }
    // กรณี Sort by Size/Date: ต้องดึง Stats ทั้งหมดก่อนถึงจะเรียงได้
    else {
        const allFilesWithStats = await Promise.all(
            files.map(async (file) => await getFileStats(physicalPath, file, reqPath))
        );

        const validFiles = allFilesWithStats.filter((f): f is NonNullable<typeof f> => f !== null);

        validFiles.sort((a, b) => {
            let comparison = 0;
            const aSize = typeof a.size === 'number' ? a.size : 0;
            const bSize = typeof b.size === 'number' ? b.size : 0;

            if (sortBy === 'size') {
                comparison = aSize - bSize;
            } else if (sortBy === 'date') {
                const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                comparison = aDate - bDate;
            }

            return order === 'asc' ? comparison : -comparison;
        });

        const startIndex = (page - 1) * limit;
        resultFiles = validFiles.slice(startIndex, startIndex + limit);
    }

    return {
        data: resultFiles.filter(Boolean),
        totalFiles
    };
}