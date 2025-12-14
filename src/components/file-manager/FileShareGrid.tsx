import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ptb from 'pretty-bytes'
import { File as FileIcon, Folder, Star, DownloadCloudIcon, InfoIcon } from "lucide-react";
import { FileItem } from "./config";
import * as fileService from "@/lib/api/file.service";

// Import Shadcn Context Menu
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuShortcut,
} from "@/components/ui/context-menu";
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { logerror } from "@/lib/logger";
import prettyBytes from "pretty-bytes";

type FileShareGridProps = {
    files: FileItem[];
    activeFilePath: string | null;
    listLoading: boolean;
    onSelectFile: (path: string) => void;
    onOpenDirectory: (path: string) => void;
    ShareLinkID: string,
};

export function FileShareGrid({
    files,
    activeFilePath,
    listLoading,
    onSelectFile,
    onOpenDirectory,
    ShareLinkID,

}: FileShareGridProps) {
    const lastTapRef = useRef(0);

    const [infoOpen, setInfoOpen] = useState(false);
    const [infoData, setInfoData] = useState<FileItem>();

    async function onInfo(file: FileItem) {
        setInfoData(file)
        setInfoOpen(true)
    }

    async function onDownload( id: string ,file: FileItem) {
        try {
            const blob = await fileService.downloadShareFile(id ,file.path);
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

    return (
        <ScrollArea className="flex-1 overflow-y-scroll">
            <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {listLoading && (
                    <div className="col-span-full flex justify-center py-10 text-sm text-slate-400">
                        Loading file...
                    </div>
                )}

                {!listLoading && files &&
                    files.map((file) => {
                        const isActive = activeFilePath === file.path;
                        const isDirectory = file.type === "directory";

                        return (
                            <ContextMenu key={file.path || file.id}>
                                <ContextMenuTrigger asChild>
                                    <Card
                                        className={`cursor-pointer border-white/10 bg-slate-900/70 hover:bg-slate-800/80 transition ${isActive ? "ring-1 ring-red-500/60" : ""
                                            }`}
                                        onClick={() => {
                                            onSelectFile(file.path);
                                        }}
                                        draggable={"true"}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            if (isDirectory) {
                                                onOpenDirectory(file.path);
                                            }
                                        }}

                                        onTouchEnd={(e) => {
                                            const now = Date.now();
                                            const DOUBLE_TAP_DELAY = 300;

                                            if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
                                                e.preventDefault();
                                                e.stopPropagation();

                                                if (isDirectory) {
                                                    onOpenDirectory(file.path);
                                                }
                                            } else {
                                                lastTapRef.current = now;
                                            }
                                        }}
                                    >
                                        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                                            <div className="flex items-center gap-2 select-none">
                                                <div className="w-8 h-8 rounded-md bg-red-500/20 flex items-center justify-center">
                                                    {isDirectory ? (
                                                        <Folder className="w-4 h-4 text-red-400" />
                                                    ) : (
                                                        <FileIcon className="w-4 h-4 text-red-200" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <CardTitle className="text-sm truncate max-w-32">
                                                        {file.name}
                                                    </CardTitle>
                                                    <span className="text-[11px] text-slate-500 max-w-32">
                                                        {file.type || "File"}
                                                    </span>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0 text-xs text-slate-400 space-y-1 select-none">
                                            {file.size && <p>Size: {ptb(Number(file.size))}</p>}
                                            {file.updatedAt && <p>Updated: {file.updatedAt}</p>}
                                        </CardContent>
                                    </Card>
                                </ContextMenuTrigger>

                                {/* เมนูคลิกขวาของ File Item (ใช้ Theme เดียวกัน) */}
                                <ContextMenuContent className="min-w-[220px] rounded-xl border border-slate-800/80 bg-slate-900/95 backdrop-blur-md shadow-xl shadow-black/40 py-1">
                                    <ContextMenuItem
                                        inset
                                        onClick={() => onInfo?.(file)}
                                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                                    >
                                        <InfoIcon className="h-3.5 w-3.5 text-slate-400" />
                                        <span>Info</span>
                                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500"></ContextMenuShortcut>
                                    </ContextMenuItem>

                                    <ContextMenuItem
                                        inset
                                        onClick={() => onDownload?.(ShareLinkID ,file)}
                                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                                    >
                                        <DownloadCloudIcon className="h-3.5 w-3.5 text-slate-400" />
                                        <span>Download</span>
                                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500"></ContextMenuShortcut>
                                    </ContextMenuItem>

                                </ContextMenuContent>
                            </ContextMenu>
                        );
                    })}

                <Dialog open={infoOpen} onOpenChange={() => setInfoOpen(false)}>
                    <DialogContent>
                        <DialogHeader className=" text-wrap">
                            <DialogTitle>Info {infoData?.name}</DialogTitle>
                        </DialogHeader>
                        <section className=" flex flex-col space-y-2">
                            <Label>Path : {infoData?.path}</Label>
                            <Label>Type : {infoData?.type}</Label>
                            <Label>Size : {prettyBytes(Number(infoData?.size ?? 0))}</Label>
                        </section>
                        <DialogFooter>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {!listLoading && (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-500">
                        <Folder className="w-10 h-10 mb-3 text-slate-600" />
                        <p className="text-sm font-medium">No files found</p>
                        <p className="text-xs text-slate-500 mt-1">
                            Try changing your search term or selecting a different folder 😄
                        </p>
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}