import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ptb from 'pretty-bytes'
import { File as FileIcon, Folder, Star, Copy, Scissors, Trash2, Pencil } from "lucide-react";
import { FileItem } from "./config";

// Import Shadcn Context Menu
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
    ContextMenuShortcut,
} from "@/components/ui/context-menu";

type FileManagerGridProps = {
    files: FileItem[];
    activeFilePath: string | null;
    listLoading: boolean;
    onSelectFile: (path: string) => void;
    onDownload: (file: FileItem) => void;
    onRename: (file: FileItem) => void;
    onDelete: (file: FileItem) => void;
    onToggleStar: (file: FileItem) => void;
    onOpenDirectory: (path: string) => void;
    // Props สำหรับ Action เสริม
    onCopy?: (file: FileItem) => void;
    onCut?: (file: FileItem) => void;
};

export function FileManagerGrid({
    files,
    activeFilePath,
    listLoading,
    onSelectFile,
    onDownload,
    onRename,
    onDelete,
    onToggleStar,
    onOpenDirectory,
    onCopy,
    onCut,
}: FileManagerGridProps) {
    return (
        <ScrollArea className="flex-1 overflow-y-scroll">
            <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {listLoading && !files.length && (
                    <div className="col-span-full flex justify-center py-10 text-sm text-slate-400">
                        Loading file...
                    </div>
                )}

                {!listLoading &&
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
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            if (isDirectory) {
                                                onOpenDirectory(file.path);
                                            }
                                        }}
                                    >
                                        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                                            <div className="flex items-center gap-2">
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
                                                    <span className="text-[11px] text-slate-500">
                                                        {file.type || "File"}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onToggleStar(file);
                                                }}
                                                className="text-slate-500 hover:text-yellow-400 transition"
                                            >
                                                <Star
                                                    className={`w-4 h-4 ${file.isStarred ? "fill-yellow-400" : ""
                                                        }`}
                                                />
                                            </button>
                                        </CardHeader>
                                        <CardContent className="pt-0 text-xs text-slate-400 space-y-1">
                                            {file.size && <p>Size: {ptb(Number(file.size))}</p>}
                                            {file.updatedAt && <p>Updated: {file.updatedAt}</p>}
                                        </CardContent>
                                    </Card>
                                </ContextMenuTrigger>

                                {/* เมนูคลิกขวาของ File Item (ใช้ Theme เดียวกัน) */}
                                <ContextMenuContent className="min-w-[220px] rounded-xl border border-slate-800/80 bg-slate-900/95 backdrop-blur-md shadow-xl shadow-black/40 py-1">
                                    <ContextMenuItem
                                        inset
                                        onClick={() => onCopy?.(file)}
                                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                                    >
                                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                                        <span>Copy</span>
                                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500">Ctrl+C</ContextMenuShortcut>
                                    </ContextMenuItem>

                                    <ContextMenuItem
                                        inset
                                        onClick={() => onCut?.(file)}
                                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                                    >
                                        <Scissors className="h-3.5 w-3.5 text-slate-400" />
                                        <span>Cut</span>
                                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500">Ctrl+X</ContextMenuShortcut>
                                    </ContextMenuItem>

                                    <ContextMenuItem
                                        inset
                                        onClick={() => onRename(file)}
                                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                                    >
                                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                                        <span>Rename</span>
                                    </ContextMenuItem>

                                    <ContextMenuSeparator className="my-1 bg-slate-800/80" />

                                    <ContextMenuItem
                                        inset
                                        className="flex items-center gap-2 text-red-400 focus:bg-slate-800/80 focus:text-red-400"
                                        onClick={() => onDelete(file)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span>Delete</span>
                                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500">Del</ContextMenuShortcut>
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        );
                    })}

                {!listLoading && !files.length && (
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