"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FileManagerTopBar } from "@/components/file-manager/FileManagerTopBar";
import { FileManagerSidebarNav } from "@/components/file-manager/FileManagerSidebarNav";
import { Crumb, FileManagerToolbar } from "@/components/file-manager/FileManagerToolbar";
import { PasteBar } from "@/components/file-manager/PasteBar";
import { FileManagerGrid } from "@/components/file-manager/FileManagerGrid";
import { FileManagerPreviewPanel } from "@/components/file-manager/FileManagerPreviewPanel";
import { FileActionSheet } from "@/components/file-manager/FileActionSheet";
import { getFileActions, isTrashItem } from "@/lib/file-manager/fileActions";
import { mediaTypeOf, rawFileUrl } from "@/lib/file-manager/media";
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
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDownIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";

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
    handleRestore,
    handleEmptyTrash,

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

    handleSumitShare,

    handlePaste,
    handleCut,
    handleCopy,
    clipboard,
    clearClipboard,
  } = useFileManager();

  const handleOpenTerminal = () => {
    setIsTerminalOpen(!isTerminalOpen);
  };

  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (terminalRef.current && !terminalRef.current.contains(event.target as Node)) {
        setIsTerminalOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [terminalRef]);

  const isTrashTarget = !!fileToDelete && isTrashItem(fileToDelete);

  const [tempName, setTempName] = useState("");

  const onRenameClick = (file: FileItem) => {
    handleRename(file);
    setTempName(file.name);
  };

  const [shareOpen, setShareOpen] = useState(false)
  const [shareFile, setShareFile] = useState<FileItem | null>(null)
  const [recursive, setRecursive] = useState(false)
  const [date, setDate] = useState<Date>()
  const [shareDateOpen, setShareDateOpen] = useState(false)

  async function handleShare(file: FileItem) {
    setShareOpen(true)
    setShareFile(file)
  }

  // The action sheet: opened by a touch long press or ⋮ (actions first), by
  // tapping a file when the side panel is hidden, or by Info in a menu (details first).
  // A new key per open resets the sheet; the last file stays so it can animate out.
  const [sheet, setSheet] = useState<{ file: FileItem; showInfo: boolean; key: number } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  function openSheet(file: FileItem, showInfo: boolean) {
    // Selecting it also loads the text preview shown under Info
    setActiveFilePath(file.path)
    setSheet((prev) => ({ file, showInfo, key: (prev?.key ?? 0) + 1 }))
    setSheetOpen(true)
  }

  // Touch: a tap opens a folder, or shows a file in the sheet
  function handleTouchTap(file: FileItem) {
    if (file.type === "directory" && !isTrashItem(file)) {
      handleOpenDirectory(file.path)
      return
    }
    setActiveFilePath(file.path)
    // From xl up the side panel already shows the file
    if (!window.matchMedia("(min-width: 1280px)").matches) openSheet(file, true)
  }

  // Mouse double-click (or Enter): open a folder, or media full size in a new tab
  function handleOpen(file: FileItem) {
    if (isTrashItem(file)) return
    if (file.type === "directory") {
      handleOpenDirectory(file.path)
    } else if (mediaTypeOf(file.name)) {
      window.open(rawFileUrl(file.path), "_blank", "noopener")
    }
  }

  const actionHandlers = {
    download: handleDownload,
    star: handleToggleStar,
    share: handleShare,
    rename: onRenameClick,
    copy: handleCopy,
    cut: handleCut,
    restore: handleRestore,
    delete: handleDelete,
  }

  // Desktop menus also get Info, for when the side panel is hidden
  const menuActionsFor = (file: FileItem) =>
    getFileActions(file, { ...actionHandlers, info: (f) => openSheet(f, true) })

  // The sheet's file as it is now in the list (e.g. after starring it)
  const sheetFile = sheet ? visibleFiles.find((f) => f.path === sheet.file.path) ?? sheet.file : null
  const sheetActions = sheetFile ? getFileActions(sheetFile, actionHandlers) : []

  function handleSelectFolder(folderId: string) {
    const params = new URLSearchParams(searchParams ?? "");
    if (params.has("path")) {
      params.delete("path");
      router.push(`${pathname}?${params.toString()}`);
    }
    setSelectedFolder(folderId);
    setPage(1);
  }

  // "All files / alice / pics": the root view, then each folder of the open path
  const pathParts = (urlPath ?? "").split("/").filter(Boolean)
  const crumbs: Crumb[] = [
    { label: currentFolderLabel, onClick: () => handleOpenDirectory("") },
    ...pathParts.map((part, i) => ({
      label: part,
      onClick: () => handleOpenDirectory(pathParts.slice(0, i + 1).join("/")),
    })),
  ]

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

        <Dialog open={shareOpen} onOpenChange={(open) => !open && setShareOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share File</DialogTitle>
            </DialogHeader>

            <div className="flex py-4 justify-center items-center space-x-5">
              <span>File : <span className="bg-primary/80 px-2 py-1 rounded-sm">{shareFile?.path}</span></span>
              <div className="flex flex-col gap-3">
                <Label htmlFor="date-picker" className="px-1">
                  Expired Date
                </Label>
                <Popover open={shareDateOpen} onOpenChange={setShareDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      id="date-picker"
                      className="w-32 justify-between font-normal"
                    >
                      {date ? date.toLocaleDateString() : "Select date"}
                      <ChevronDownIcon />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      showOutsideDays={false}
                      captionLayout="dropdown"
                      onSelect={(date) => {
                        const now = new Date()
                        if (date && now > date) {
                          toast.warning('Your selected time is after the current time.', {
                            duration: 3000
                          })
                        }

                        setDate(date)
                        setShareDateOpen(false)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {shareFile?.type === 'directory' && (
                <div className=" space-y-2">
                  <Label>
                    Recursive?
                  </Label>
                  <Input
                    type="checkbox"
                    onChange={e => setRecursive(e.target?.checked)}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => {
                setShareOpen(false)
                if (shareFile) handleSumitShare(shareFile?.path, date ?? null, recursive)
              }}
                disabled={isRenaming}
              >
                Confirm
              </Button>
              <Button variant="outline" onClick={() => setShareOpen(false)} disabled={isRenaming}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!isTerminalOpen && (
          <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 max-h-screen">
            <FileManagerTopBar
              query={query}
              searchCount={searchCount}
              openTools={true}
              onQueryChange={(value) => {
                setPage(1);
                setQuery(value);
              }}
              onOpenTerminal={handleOpenTerminal}
              currentPath={urlPath ?? ""}
              onUploaded={refetchFiles}
              nav={{ selectedFolder, onSelectFolder: handleSelectFolder }}
            />

            <main className="flex flex-1 overflow-hidden">
              <FileManagerSidebarNav
                selectedFolder={selectedFolder}
                onSelectFolder={handleSelectFolder}
              />

              <section className="flex flex-1 overflow-hidden">

                <div className="flex-1 flex flex-col">
                  <FileManagerToolbar
                    crumbs={crumbs}
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
                    onEmptyTrash={selectedFolder === "trash" && !urlPath ? handleEmptyTrash : undefined}
                  />

                  <FileManagerGrid
                    files={visibleFiles}
                    activeFilePath={activeFilePath}
                    listLoading={listLoading}
                    onSelect={(file) => setActiveFilePath(file.path)}
                    onOpen={handleOpen}
                    onTouchTap={handleTouchTap}
                    onOpenSheet={(file) => openSheet(file, false)}
                    menuActionsFor={menuActionsFor}
                    onToggleStar={handleToggleStar}
                    showLocation={!!query.trim()}
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
                  onRestore={handleRestore}
                />
              </section>
            </main>

            <PasteBar clipboard={clipboard} onPaste={handlePaste} onCancel={clearClipboard} />

            <FileActionSheet
              key={sheet?.key}
              file={sheetFile}
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              actions={sheetActions}
              defaultShowInfo={sheet?.showInfo}
              preview={sheetFile && sheetFile.path === activeFile?.path ? {
                content: previewContent,
                size: previewSize,
                loading: previewLoading,
                error: previewError,
              } : undefined}
            />

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

            <div ref={terminalRef}>
              <VncPage />
            </div>
          </div>
        )}
      </ContextMenuBar>
    </Suspense>
  );
}