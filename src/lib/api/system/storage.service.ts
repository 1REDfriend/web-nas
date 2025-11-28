export const fetchStorage = async () => {
    try {
        const res = await fetch('/api/files/system/storage');
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        return data
    } catch (error) {
        console.error("Error loading storage info", error);
    }
};