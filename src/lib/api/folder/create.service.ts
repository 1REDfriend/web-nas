import { logerror } from "@/lib/logger";

export interface CreateFolderResponse {
    success: boolean;
    message?: string;
    error?: string;
}

export async function createFolderApi(path: string, name: string): Promise<CreateFolderResponse> {
    try {
        const response = await fetch("/api/files/folder/create", {
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
    } catch (err : unknown) {
        logerror("[create folder service Failed] :", err)
        return {success: false, error: "Internal Error"}
    }
}