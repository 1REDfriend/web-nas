"use client";

import { useEffect, useMemo, useState } from "react";
import * as fileService from "@/lib/api/file.service";
import { logerror } from "@/lib/logger";
import {
    FOLDER_PATHS,
    FileItem,
    FileListMeta,
} from "@/components/file-manager/config";

type UseFileListParams = {
    selectedFolder: string;
    page: number;
    query: string;
    urlPath: string | null;
    refetchTrigger: number;
};

type UseFileListResult = {
    files: FileItem[];
    setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>;
    meta: FileListMeta | null;
    listLoading: boolean;
    listError: string | null;
    activeFilePath: string | null;
    setActiveFilePath: React.Dispatch<React.SetStateAction<string | null>>;
    visibleFiles: FileItem[];
    activeFile: FileItem | null;
    searchCount: number;
    totalPages: number;
};

export function useFileList({
    selectedFolder,
    page,
    query,
    urlPath,
    refetchTrigger,
}: UseFileListParams): UseFileListResult {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [meta, setMeta] = useState<FileListMeta | null>(null);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function loadFiles() {
            try {
                setListLoading(true);
                setListError(null);

                let baseFolderPath: string | null =
                    (FOLDER_PATHS as Record<string, string | null>)[selectedFolder] ?? null;

                if (baseFolderPath && !baseFolderPath.startsWith("/")) {
                    baseFolderPath = `/${baseFolderPath}`;
                }

                let folderPath: string | null = urlPath || baseFolderPath || null;

                if (folderPath && !folderPath.startsWith("/")) {
                    folderPath = `/${folderPath}`;
                }

                if (folderPath === "/") {
                    folderPath = null;
                }

                const view =
                    selectedFolder === "starred" || selectedFolder === "recent"
                        ? selectedFolder
                        : undefined;

                const { data, meta } = await fileService.fetchFiles(
                    {
                        folderPath,
                        view,
                        page,
                        query: query.trim(),
                        sortBy: "name",
                        order: "asc",
                    },
                    controller.signal
                );

                setFiles(data);
                setMeta(meta);

                setActiveFilePath((prev) => {
                    if (!data.length) return null;
                    if (prev && data.some((f) => f.path === prev)) return prev;
                    return data[0].path || data[0].name;
                });
            } catch (err: unknown) {
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }
                logerror(err instanceof Error ? err.message : String(err));
                setListError(
                    err instanceof Error
                        ? err.message
                        : "An error occurred while loading the file."
                );
                setFiles([]);
                setMeta(null);
            } finally {
                setListLoading(false);
            }
        }

        loadFiles();

        return () => controller.abort();
    }, [selectedFolder, page, query, urlPath, refetchTrigger]);

    // The server already returns the Starred / Recent lists; only drop items
    // un-starred while the Starred view is open
    const visibleFiles = useMemo(
        () => (selectedFolder === "starred" && !urlPath ? files.filter((f) => f.isStarred) : files),
        [files, selectedFolder, urlPath]
    );

    const activeFile = useMemo(() => {
        if (!visibleFiles.length) return null;
        if (activeFilePath) {
            const found = visibleFiles.find((f) => f.path === activeFilePath);
            if (found) return found;
        }
        return visibleFiles[0];
    }, [visibleFiles, activeFilePath]);

    const searchCount = meta?.totalFiles ?? visibleFiles.length;
    const totalPages = meta
        ? Math.max(1, Math.ceil(meta.totalFiles / meta.itemsPerPage))
        : 1;

    return {
        files,
        setFiles,
        meta,
        listLoading,
        listError,
        activeFilePath,
        setActiveFilePath,
        visibleFiles,
        activeFile,
        searchCount,
        totalPages,
    };
}
