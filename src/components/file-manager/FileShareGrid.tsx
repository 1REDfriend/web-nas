import { useState } from "react";
import { DownloadCloudIcon } from "lucide-react";
import { FileItem } from "./config";
import { publicShareDownloadUrl } from "@/lib/api/user/share";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { mediaTypeOf, shareRawUrl, shareThumbnailUrl } from "@/lib/file-manager/media";
import { getFileActions } from "@/lib/file-manager/fileActions";
import { MediaPreview } from "./MediaPreview";
import { FileManagerGrid } from "./FileManagerGrid";
import { FileActionSheet } from "./FileActionSheet";

type FileShareGridProps = {
    files: FileItem[];
    activeFilePath: string | null;
    listLoading: boolean;
    onSelectFile: (path: string) => void;
    onOpenDirectory: (path: string) => void;
    ShareLinkID: string,
};

// A share link's files for visitors: the same list, sheet and menus as the
// file manager, with only what a visitor may do (Info, Download).
// Paths are relative to the shared folder; there is no trash here.
export function FileShareGrid({
    files,
    activeFilePath,
    listLoading,
    onSelectFile,
    onOpenDirectory,
    ShareLinkID,
}: FileShareGridProps) {
    // Image, video or audio file shown in the large preview dialog (mouse click)
    const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
    const previewMedia = previewFile ? mediaTypeOf(previewFile.name) : null;

    // Same pattern as the file manager page: new key per open, keep the file while it animates out
    const [sheet, setSheet] = useState<{ file: FileItem; showInfo: boolean; key: number } | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    function openSheet(file: FileItem, showInfo: boolean) {
        onSelectFile(file.path);
        setSheet((prev) => ({ file, showInfo, key: (prev?.key ?? 0) + 1 }));
        setSheetOpen(true);
    }

    function onDownload(file: FileItem) {
        // A plain link lets the browser stream the file to disk instead of buffering it
        const a = document.createElement("a");
        a.href = publicShareDownloadUrl(ShareLinkID, file.path);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    const isDirectory = (file: FileItem) => file.type === "directory";

    const actionsFor = (file: FileItem, withInfo: boolean) =>
        getFileActions(
            file,
            { download: onDownload, ...(withInfo && { info: (f: FileItem) => openSheet(f, true) }) },
            undefined,
            false,
        );

    return (
        <>
            <FileManagerGrid
                files={files}
                activeFilePath={activeFilePath}
                listLoading={listLoading}
                onSelect={(file) => {
                    onSelectFile(file.path);
                    // Visitors have no preview panel: a click on media opens it straight away
                    if (!isDirectory(file) && mediaTypeOf(file.name)) setPreviewFile(file);
                }}
                onOpen={(file) => isDirectory(file) && onOpenDirectory(file.path)}
                onTouchTap={(file) => (isDirectory(file) ? onOpenDirectory(file.path) : openSheet(file, true))}
                onOpenSheet={(file) => openSheet(file, false)}
                menuActionsFor={(file) => actionsFor(file, true)}
                thumbnailSrc={(file) => shareThumbnailUrl(ShareLinkID, file.path)}
                isTrash={() => false}
            />

            <FileActionSheet
                key={sheet?.key}
                file={sheet?.file ?? null}
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                actions={sheet ? actionsFor(sheet.file, false) : []}
                defaultShowInfo={sheet?.showInfo}
                mediaSrc={sheet ? shareRawUrl(ShareLinkID, sheet.file.path) : undefined}
                inTrash={false}
            />

            <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="truncate">{previewFile?.name}</DialogTitle>
                    </DialogHeader>
                    {previewFile && previewMedia && (
                        <MediaPreview
                            key={previewFile.path}
                            src={shareRawUrl(ShareLinkID, previewFile.path)}
                            name={previewFile.name}
                            kind={previewMedia.kind}
                        />
                    )}
                    <DialogFooter>
                        {previewFile && (
                            <Button variant="outline" className="gap-2" onClick={() => onDownload(previewFile)}>
                                <DownloadCloudIcon className="h-4 w-4" />
                                Download
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
