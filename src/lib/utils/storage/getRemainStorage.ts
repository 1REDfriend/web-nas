import checkDiskSpace from 'check-disk-space';

export async function getRemainStorage() {
    try {
        const path = process.platform === 'win32' ? 'C:/' : '/';

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