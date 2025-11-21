import { logerror } from "@/lib/logger";

const API_BASE = "/api/files";

type FileItem = {
    id?: string | number;
    name: string;
    path: string;
    type?: string;
    size?: string | number;
    updatedAt?: string;
    folder?: string;
    isStarred?: boolean;
};

type FileListMeta = {
    totalFiles: number;
    currentPage: number;
    itemsPerPage: number;
    sortBy?: string;
    order?: "asc" | "desc";
};

async function handleApiError(res: Response) {
    if (!res.ok) {
        let errorMessage = `API Error: ${res.status} ${res.statusText}`;
        try {
            const errorJson = await res.json();
            errorMessage = errorJson.message || errorMessage;
        } catch {
        }
        logerror(errorMessage);
        throw new Error(errorMessage);
    }
}

type FetchFilesParams = {
    folderPath: string | null;
    page: number;
    query: string;
    sortBy: string;
    order: "asc" | "desc";
};

export async function fetchFiles(
    params: FetchFilesParams,
    signal: AbortSignal
): Promise<{ data: FileItem[]; meta: FileListMeta | null }> {
    const urlParams = new URLSearchParams();
    if (params.folderPath) {
        urlParams.set("path", params.folderPath);
    }
    urlParams.set("page", String(params.page));
    if (params.query.trim()) {
        urlParams.set("search", params.query.trim());
    }
    urlParams.set("sortBy", params.sortBy);
    urlParams.set("order", params.order);

    const res = await fetch(`${API_BASE}/list?${urlParams.toString()}`, {
        signal,
    });

    await handleApiError(res);
    const json = await res.json();
    return {
        data: (json.data || []) as FileItem[],
        meta: json.meta || null,
    };
}

export async function fetchFilePreview(
    path: string,
    signal: AbortSignal
): Promise<{ content: string | null; size: number | null }> {
    const params = new URLSearchParams();
    params.set("file", path);
    params.set("option", "preview")

    const res = await fetch(`${API_BASE}/read?${params.toString()}`, {
        signal,
    });

    await handleApiError(res);
    const json = await res.json();
    return {
        content: json.content ?? null,
        size: json.size ?? null,
    };
}

export async function fetchFileRead(
    path: string,
    signal: AbortSignal
): Promise<{ content: string | null; size: number | null }> {
    const params = new URLSearchParams();
    params.set("file", path);

    const res = await fetch(`${API_BASE}/read?${params.toString()}`, {
        signal,
    });

    await handleApiError(res);
    const json = await res.json();
    return {
        content: json.content ?? null,
        size: json.size ?? null,
    };
}

export async function downloadFile(filePath: string): Promise<Blob> {
    const res = await fetch(`${API_BASE}/download`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ reqFile: filePath }),
    });

    await handleApiError(res);
    return res.blob();
}

export async function toggleFileStar(
    filePath: string
): Promise<{ isStarred: boolean }> {
    const params = new URLSearchParams();
    params.set("path", filePath);

    const res = await fetch(`${API_BASE}/star?${params.toString()}`, {
        method: "POST",
    });

    await handleApiError(res);
    const json = await res.json();
    return json as { isStarred: boolean };
}

export async function deleteFile(filePath: string): Promise<{ success: boolean }> {
    const params = new URLSearchParams();
    params.set("file", filePath);
    params.set("option", "delete");

    const res = await fetch(`${API_BASE}/manage?${params.toString()}`, {
        method: "POST",
    });

    await handleApiError(res);
    const json = await res.json();
    if (!json.success) {
        throw new Error(json.message || "ลบไฟล์ไม่สำเร็จ");
    }
    return json;
}

export async function renameFile(
    filePath: string,
    newName: string
): Promise<{ success: boolean; newPath: string }> {
    const params = new URLSearchParams();
    params.set("file", filePath);
    params.set("option", "rename");

    const res = await fetch(`${API_BASE}/manage?${params.toString()}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ newName }),
    });

    await handleApiError(res);
    const json = await res.json();
    if (!json.success) {
        throw new Error(json.message || "เปลี่ยนชื่อไฟล์ไม่สำเร็จ");
    }
    return json;
}

export async function upload(
    currentPath: string,
    file: File
) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('currentPath', currentPath);

    try {
        const res = await fetch('/api/files/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        return data;

    } catch (error: unknown) {
        logerror('[Error in upload service] : ' +  error);
    }
}


export async function addFolderFavorite(
    path : string,
    favorite?: string
) {
    const params = new URLSearchParams();
    params.set("path", path);
    if (favorite) params.set("like", favorite);

    const res = await fetch(`${API_BASE}/folder?${params.toString()}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        }
    });

    await handleApiError(res);
    const json = await res.json();
    if (!json.success) {
        throw new Error(json.message || "Cannot add folder");
    }
    return json;
}