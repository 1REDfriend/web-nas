"use client";

import { useEffect, useMemo, useState } from "react";

import * as fileService from "@/lib/api/file.service";
import { logerror } from "@/lib/logger";

import {
  FOLDERS,
  FOLDER_PATHS,
  FileItem,
  FileListMeta,
  FolderId,
} from "@/components/file-manager/config";
import { FileManagerTopBar } from "@/components/file-manager/FileManagerTopBar";
import { FileManagerSidebarNav } from "@/components/file-manager/FileManagerSidebarNav";
import { FileManagerFolderTree } from "@/components/file-manager/FileManagerFolderTree";
import { FileManagerToolbar } from "@/components/file-manager/FileManagerToolbar";
import { FileManagerGrid } from "@/components/file-manager/FileManagerGrid";
import { FileManagerPreviewPanel } from "@/components/file-manager/FileManagerPreviewPanel";
import { UploadDialog } from "@/components/file-manager/FileUploadDialog";
import { useRouter } from "next/navigation";
import { ComtextMenuBar } from "@/components/ComtextMenuBar";

export default function FileManagerPage() {
  const [contextMenu, setContextMenu] = useState(null)

  const [selectedFolder, setSelectedFolder] = useState<FolderId>("all");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [meta, setMeta] = useState<FileListMeta | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [currentPath, setCurrentPath] = useState<string | null>(null);

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const router = useRouter()

  useEffect(() => {
    const controller = new AbortController();

    async function loadFiles() {
      try {
        setListLoading(true);
        setListError(null);

        const baseFolderPath = FOLDER_PATHS[selectedFolder];
        const folderPath = currentPath || baseFolderPath;

        const { data, meta } = await fileService.fetchFiles(
          {
            folderPath,
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
  }, [selectedFolder, page, query, currentPath, refetchTrigger]);

  const visibleFiles = useMemo(() => {
    let data = [...files];

    if (selectedFolder === "starred") {
      data = data.filter((f) => f.isStarred);
    } else if (selectedFolder === "recent") {
      data = data
        .slice()
        .sort((a, b) => {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        });
    }

    return data;
  }, [files, selectedFolder]);

  const activeFile = useMemo(() => {
    if (!visibleFiles.length) return null;
    if (activeFilePath) {
      const found = visibleFiles.find((f) => f.path === activeFilePath);
      if (found) return found;
    }
    return visibleFiles[0];
  }, [visibleFiles, activeFilePath]);

  const activePath = activeFile?.path || "";

  useEffect(() => {
    if (!activePath || activeFile?.type === "directory") {
      setPreviewContent(null);
      setPreviewSize(null);
      return;
    }

    const controller = new AbortController();

    async function loadPreview() {
      try {
        setPreviewLoading(true);
        setPreviewError(null);

        const { content, size } = await fileService.fetchFilePreview(
          activePath,
          controller.signal
        );

        setPreviewContent(content);
        setPreviewSize(size);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        logerror(err instanceof Error ? err.message : String(err));
        setPreviewError(
          err instanceof Error
            ? err.message
            : "An error occurred while loading the file."
        );
        setPreviewContent(null);
        setPreviewSize(null);
      } finally {
        setPreviewLoading(false);
      }
    }

    loadPreview();

    return () => controller.abort();
  }, [activePath]);

  const searchCount = meta?.totalFiles ?? visibleFiles.length;
  const totalPages = meta
    ? Math.max(1, Math.ceil(meta.totalFiles / meta.itemsPerPage))
    : 1;

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
      logerror(err + "");
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
      logerror(err + "");
      alert(
        err instanceof Error ? err.message : "Unable to update star status"
      );
    }
  }

  async function handleDelete(file: FileItem) {
    if (!confirm(`Move "${file.name}" Go to the trash can or not?`)) return;

    try {
      await fileService.deleteFile(file.path);
      setFiles((prev) => prev.filter((f) => f.path !== file.path));
    } catch (err) {
      logerror(err + "");
      alert(err instanceof Error ? err.message : "Failed to delete file");
    }
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
      logerror(err + "");
      alert(err instanceof Error ? err.message : "Failed to rename the file.");
    }
  }

  function handleOpenDirectory(path: string) {
    const baseFolderPath = FOLDER_PATHS[selectedFolder];
    let relative = path;
    if (baseFolderPath && path.startsWith(baseFolderPath)) {
      relative = path.slice(baseFolderPath.length);
    }

    relative = relative.replace(/^\/+/, "");

    setCurrentPath(relative || null);
    setPage(1);
    setActiveFilePath(null);
  }

  const currentFolderLabel =
    FOLDERS.find((f) => f.id === selectedFolder)?.label ?? "Files";

  return (
    <ComtextMenuBar>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
        <FileManagerTopBar
          query={query}
          searchCount={searchCount}
          onQueryChange={(value) => {
            setPage(1);
            setQuery(value);
          }}
        />

        <UploadDialog
          currentPath={currentPath ?? ""}
          onUploaded={() => {
            setRefetchTrigger((count) => count + 1);
          }}
          triggerEnable={false}
          enableGlobalDrop={true}
        />

        {/* Main layout */}
        <main className="flex flex-1 overflow-hidden">
          <FileManagerSidebarNav
            selectedFolder={selectedFolder}
            onSelectFolder={(folderId) => {
              setSelectedFolder(folderId);
              setPage(1);
            }}
          />

          {/* Middle & right panels */}
          <section className="flex flex-1 overflow-hidden">
            <FileManagerFolderTree
              selectedFolder={selectedFolder}
              onSelectFolder={(folderId) => {
                setSelectedFolder(folderId);
                setPage(1);
              }}
            />

            {/* Center: file list */}
            <div className="flex-1 flex flex-col">
              <FileManagerToolbar
                title={currentFolderLabel}
                visibleCount={visibleFiles.length}
                listError={listError}
                meta={meta}
                page={page}
                totalPages={totalPages}
                listLoading={listLoading}
                hasActiveFile={!!activeFile}
                onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
                onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
                onDownloadActive={() => {
                  if (activeFile) handleDownload(activeFile);
                }}
              />

              <FileManagerGrid
                files={visibleFiles}
                activeFilePath={activeFile?.path ?? null}
                listLoading={listLoading}
                onSelectFile={setActiveFilePath}
                onDownload={handleDownload}
                onRename={handleRename}
                onDelete={handleDelete}
                onToggleStar={handleToggleStar}
                onOpenDirectory={handleOpenDirectory}
              />
            </div>

            <FileManagerPreviewPanel
              activeFile={activeFile}
              previewContent={previewContent}
              previewSize={previewSize}
              previewLoading={previewLoading}
              previewError={previewError}
              onDownload={handleDownload}
              onToggleStar={handleToggleStar}
              onDelete={handleDelete}
            />
          </section>
        </main>
      </div>
    </ComtextMenuBar>
  );
}
