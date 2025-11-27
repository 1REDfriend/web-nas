"use client";

import { useState } from "react";

import { FileManagerTopBar } from "@/components/file-manager/FileManagerTopBar";
import { FileManagerSidebarNav } from "@/components/file-manager/FileManagerSidebarNav";
import { FileManagerFolderTree } from "@/components/file-manager/FileManagerFolderTree";
import { FileManagerToolbar } from "@/components/file-manager/FileManagerToolbar";
import { FileManagerGrid } from "@/components/file-manager/FileManagerGrid";
import { FileManagerPreviewPanel } from "@/components/file-manager/FileManagerPreviewPanel";
import { UploadDialog } from "@/components/file-manager/FileUploadDialog";
import LoginCheck from "@/components/auth/loginCheck";
import { ContextMenuBar } from "@/components/ContextMenuBar";
import VncPage from "@/components/vnc/vncScreen";

import { useFileManager } from "@/lib/file-manager/useFileManager";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function FileManagerPage() {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const {
    selectedFolder,
    setSelectedFolder,
    meta,
    activeFile,
    activeFilePath,
    setActiveFilePath,
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
    searchCount,
    totalPages,
    currentFolderLabel,
    urlPath,
    handleDownload,
    handleToggleStar,
    handleDelete,
    handleRename,
    handleOpenDirectory,
    refetchFiles,
  } = useFileManager();

  const handleOpenTerminal = () => {
    setIsTerminalOpen(!isTerminalOpen);
  };

  return (
    <ContextMenuBar>
      <LoginCheck />

      {!isTerminalOpen && (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 max-h-screen">
          <FileManagerTopBar
            query={query}
            searchCount={searchCount}
            onQueryChange={(value) => {
              setPage(1);
              setQuery(value);
            }}
            onOpenTerminal={handleOpenTerminal}
          />

          <UploadDialog
            currentPath={urlPath ?? ""}
            onUploaded={refetchFiles}
            triggerEnable={false}
            enableGlobalDrop={true}
          />

          <main className="flex flex-1 overflow-hidden">
            <FileManagerSidebarNav
              selectedFolder={selectedFolder}
              onSelectFolder={(folderId) => {
                setSelectedFolder(folderId);
                setPage(1);
              }}
            />

            <section className="flex flex-1 overflow-hidden">
              <FileManagerFolderTree
                selectedFolder={selectedFolder}
                onSelectFolder={(folderId) => {
                  const params = new URLSearchParams(searchParams ?? "");
                  if (params.has("path")) {
                    params.delete("path");
                    router.push(`${pathname}?${params.toString()}`);
                  }
                  setSelectedFolder(folderId);
                  setPage(1);
                }}
              />

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
                  activeFilePath={activeFilePath}
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
      )}

      {isTerminalOpen && (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 max-h-screen">
          <FileManagerTopBar
            query={query}
            searchCount={searchCount}
            onQueryChange={(value) => {
              setPage(1);
              setQuery(value);
            }}
            onOpenTerminal={handleOpenTerminal}
          />
          <VncPage />
        </div>
      )}
    </ContextMenuBar>
  );
}
