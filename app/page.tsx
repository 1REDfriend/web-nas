"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FileManagerTopBar } from "@/components/file-manager/FileManagerTopBar";
import { FileManagerSidebarNav } from "@/components/file-manager/FileManagerSidebarNav";
import { FileManagerToolbar } from "@/components/file-manager/FileManagerToolbar";
import { FileManagerGrid } from "@/components/file-manager/FileManagerGrid";
import { FileManagerPreviewPanel } from "@/components/file-manager/FileManagerPreviewPanel";
import LoginCheck from "@/components/auth/loginCheck";
import { ContextMenuBar } from "@/components/ContextMenuBar";
import VncPage from "@/components/vnc/vncScreen";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useFileManager } from "@/lib/file-manager/useFileManager";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileItem } from "@/components/file-manager/config";

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
    fileToRename,
    isRenaming,
    handleConfirmRename,
    handleCancelRename,

    handleOpenDirectory,
    refetchFiles,

    fileToDelete,
    handleConfirmDelete,
    handleCancelDelete,
    isDeleting,

    handlePaste,
    handleCut,
    handleCopy,
  } = useFileManager();

  const handleOpenTerminal = () => {
    setIsTerminalOpen(!isTerminalOpen);
  };

  const isTrashTarget = fileToDelete?.path.startsWith('/trash') || fileToDelete?.path.startsWith('trash');

  const [tempName, setTempName] = useState("");

  const onRenameClick = (file: FileItem) => {
    handleRename(file);
    setTempName(file.name);
  };

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ContextMenuBar
        onBack={() => {
          router.back()
        }}
        onForward={() => {
          router.forward()
        }}
        onReload={refetchFiles}
        onPaste={handlePaste}
      >
        <LoginCheck />

        <Dialog open={!!fileToRename} onOpenChange={(open) => !open && handleCancelRename()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename File</DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <Input
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmRename(tempName);
                }}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCancelRename} disabled={isRenaming}>
                Cancel
              </Button>
              <Button onClick={() => handleConfirmRename(tempName)} disabled={isRenaming}>
                {isRenaming ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              currentPath={urlPath ?? ""}
              onUploaded={refetchFiles}
            />

            <main className="flex flex-1 overflow-hidden">
              <FileManagerSidebarNav
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

              <section className="flex flex-1 overflow-hidden">

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
                    onRename={onRenameClick}
                    onDelete={handleDelete}
                    onToggleStar={handleToggleStar}
                    onOpenDirectory={handleOpenDirectory}

                    onMove={handleCut}
                    onCut={handleCut}
                    onCopy={handleCopy}
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

            <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && handleCancelDelete()}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isTrashTarget ? "Delete Permanently?" : "Move to Trash?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isTrashTarget
                      ? `Are you sure you want to permanently delete "${fileToDelete?.name}"? This action cannot be undone.`
                      : `Are you sure you want to move "${fileToDelete?.name}" to the trash?`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={handleCancelDelete} disabled={isDeleting}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      handleConfirmDelete();
                    }}
                    disabled={isDeleting}
                    className={isTrashTarget ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                  >
                    {isDeleting ? "Processing..." : (isTrashTarget ? "Delete Forever" : "Move to Trash")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

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
              currentPath={urlPath ?? ""}
              onUploaded={refetchFiles}
            />

            <VncPage />
          </div>
        )}
      </ContextMenuBar>
    </Suspense>
  );
}