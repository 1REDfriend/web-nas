import { ENV } from '@/lib/ENV';
import checkDiskSpace from 'check-disk-space';

export async function getRemainStorage() {
    try {
        const path = ENV.STORAGE_ROOT;

        const space = await checkDiskSpace(path);

        return {
            total: space.size,
            free: space.free,
            used: space.size - space.free
        };
    } catch (error) {
        console.error(error);
        return null;
    }
}