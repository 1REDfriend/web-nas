import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { File as FileIcon, Folder, Star } from "lucide-react";
import { FileItem } from "./config";

type FileManagerGridProps = {
    files: FileItem[];
    activeFilePath: string | null;
    listLoading: boolean;
    onSelectFile: (path: string) => void;
    onDownload: (file: FileItem) => void;
    onRename: (file: FileItem) => void;
    onDelete: (file: FileItem) => void;
    onToggleStar: (file: FileItem) => void;
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
}: FileManagerGridProps) {
    return (
        <ScrollArea className="flex-1">
            <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {listLoading && !files.length && (
                    <div className="col-span-full flex justify-center py-10 text-sm text-slate-400">
                        กำลังโหลดไฟล์...
                    </div>
                )}

                {!listLoading &&
                    files.map((file) => {
                        const isActive = activeFilePath === file.path;
                        return (
                            <Card
                                key={file.path || file.id}
                                className={`cursor-pointer border-white/10 bg-slate-900/70 hover:bg-slate-800/80 transition ${isActive ? "ring-1 ring-red-500/60" : ""
                                    }`}
                                onClick={() => onSelectFile(file.path)}
                            >
                                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-md bg-red-500/20 flex items-center justify-center">
                                            <FileIcon className="w-4 h-4 text-red-400" />
                                        </div>
                                        <div className="flex flex-col">
                                            <CardTitle className="text-sm truncate max-w-[160px]">
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
                                    {file.size && <p>Size: {file.size}</p>}
                                    {file.updatedAt && <p>Updated: {file.updatedAt}</p>}
                                    <div className="flex gap-2 pt-1">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-[11px]"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDownload(file);
                                            }}
                                        >
                                            DL
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-[11px]"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRename(file);
                                            }}
                                        >
                                            Rename
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-[11px]"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(file);
                                            }}
                                        >
                                            Trash
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}

                {!listLoading && !files.length && (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-500">
                        <Folder className="w-10 h-10 mb-3 text-slate-600" />
                        <p className="text-sm font-medium">No files found</p>
                        <p className="text-xs text-slate-500 mt-1">
                            ลองเปลี่ยนคำค้นหรือเลือกโฟลเดอร์อื่นดูสิ 😄
                        </p>
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}
