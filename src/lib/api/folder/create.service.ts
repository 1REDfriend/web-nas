export interface CreateFolderResponse {
    success: boolean;
    message?: string;
    error?: string;
}

export async function createFolderApi(path: string, name: string): Promise<CreateFolderResponse> {
    const response = await fetch("/api/folder", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            path,
            name,
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Failed to create folder");
    }

    return data;
}