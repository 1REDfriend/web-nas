"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import * as fileService from "@/lib/api/file.service";
import { logerror } from "@/lib/logger";
import {
    FOLDERS,
    FOLDER_PATHS,
    FileItem,
} from "@/components/file-manager/config";
import { toast } from "sonner";

import { useFileCategories } from "./useFileCategories";
import { useFileList } from "./useFileList";
import { useFilePreview } from "./useFilePreview";
import { useFileClipboard } from "./useFileClipboard";

export function useFileManager() {
    const [selectedFolder, setSelectedFolder] = useState("all");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);

    const [refetchTrigger, setRefetchTrigger] = useState(0);

    const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const searchParams = useSearchParams();
    const router = useRouter();

    const urlPath = (searchParams?.get("path") as string | null) ?? null;

    // --- categories ---
    const { categoryPaths } = useFileCategories();

    // --- list & derived state ---
    const {
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
    } = useFileList({
        selectedFolder,
        page,
        query,
        urlPath,
        categoryPaths,
        refetchTrigger,
    });

    // --- preview state ---
    const {
        previewContent,
        previewSize,
        previewLoading,
        previewError,
    } = useFilePreview({ activeFile });

    const handlePathChange = useCallback(
        (newPath: string) => {
            if (!searchParams) return;

            const params = new URLSearchParams(searchParams);

            if (!newPath) {
                params.delete("path");
            } else {
                params.set("path", newPath);
            }

            router.push(`?${params.toString()}`, { scroll: false });
            setActiveFilePath(null);
        },
        [searchParams, router, setActiveFilePath]
    );

    function refetchFiles() {
        setRefetchTrigger((count) => count + 1);
    }

    // --- clipboard hook (uses refetchFiles & urlPath) ---
    const { handleCut, handleCopy, handlePaste } = useFileClipboard({
        urlPath,
        refetchFiles,
    });

    // --- actions ---

    async function handleDownload(file: FileItem) {
        try {
            const blob = await fileService.downloadFile(file.path);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            logerror(String(err));
            alert(err instanceof Error ? err.message : "File download failed");
        }
    }

    async function handleToggleStar(file: FileItem) {
        try {
            const { isStarred } = await fileService.toggleFileStar(file.path);
            setFiles((prev) =>
                prev.map((f) =>
                    f.path === file.path ? { ...f, isStarred: isStarred } : f
                )
            );
        } catch (err) {
            logerror(String(err));
            alert(err instanceof Error ? err.message : "Unable to update star status");
        }
    }

    function handleDelete(file: FileItem) {
        setFileToDelete(file);
    }

    async function handleConfirmDelete() {
        if (!fileToDelete) return;

        setIsDeleting(true);
        const toastId = toast.loading("Processing...");

        try {
            let res = await fileService.deleteFile(fileToDelete.path);

            if (!res.success && res.error === "Require Confirm") {
                res = await fileService.deleteFile(fileToDelete.path, "true");
            }

            if (res.success) {
                setFiles((prev) =>
                    prev.filter((f) => f.path !== fileToDelete.path)
                );

                if (activeFilePath === fileToDelete.path) {
                    setActiveFilePath(null);
                }

                const isTrash =
                    fileToDelete.path.startsWith("/trash") ||
                    fileToDelete.path.startsWith("trash");

                toast.success(
                    isTrash ? "Deleted permanently" : "Moved to trash",
                    { id: toastId }
                );
                setFileToDelete(null);
            } else {
                throw new Error(res.message || res.error || "Failed to delete");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to delete file";
            logerror(msg);
            toast.error(msg, { id: toastId });
        } finally {
            setIsDeleting(false);
        }
    }

    function handleCancelDelete() {
        setFileToDelete(null);
    }

    async function handleRename(file: FileItem) {
        const newName = prompt("Rename the file", file.name);
        if (!newName || newName === file.name) return;

        try {
            const { newPath } = await fileService.renameFile(file.path, newName);
            setFiles((prev) =>
                prev.map((f) =>
                    f.path === file.path
                        ? { ...f, name: newName, path: newPath || file.path }
                        : f
                )
            );
        } catch (err) {
            logerror(String(err));
            alert(err instanceof Error ? err.message : "Failed to rename the file.");
        }
    }

    function handleOpenDirectory(path: string) {
        let baseFolderPath: string | null =
            categoryPaths.find((c) => c.id === selectedFolder)?.rootPath ??
            (FOLDER_PATHS as Record<string, string | null>)[selectedFolder];

        if (baseFolderPath && !baseFolderPath.startsWith("/")) {
            baseFolderPath = `/${baseFolderPath}`;
        }

        let normalized = path;
        if (!normalized.startsWith("/")) {
            normalized = `/${normalized}`;
        }

        let relative = normalized;

        if (baseFolderPath && normalized.startsWith(baseFolderPath)) {
            relative = normalized.slice(baseFolderPath.length);
        }

        relative = relative.replace(/^\/+/, "");

        handlePathChange(relative);
        setPage(1);
        setActiveFilePath(null);
    }

    const currentFolderLabel =
        categoryPaths.find((c) => c.id === selectedFolder)?.rootPath ??
        FOLDERS.find((f) => f.id === selectedFolder)?.label ??
        "Files";

    return {
        // state
        selectedFolder,
        setSelectedFolder,
        files,
        meta,
        activeFilePath,
        setActiveFilePath,
        categoryPaths,
        query,
        setQuery,
        page,
        setPage,
        listLoading,
        listError,
        previewContent,
        previewSize,
        previewLoading,
        previewError,
        visibleFiles,
        activeFile,
        searchCount,
        totalPages,
        currentFolderLabel,
        urlPath,
        fileToDelete,
        isDeleting,

        // actions
        handleDownload,
        handleToggleStar,
        handleDelete,
        handleConfirmDelete,
        handleCancelDelete,
        handleRename,
        handleOpenDirectory,
        refetchFiles,

        // clipboard actions
        handleCut,
        handleCopy,
        handlePaste,
    };
}
