import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DownloadCloud, File as FileIcon, Star, Trash2 } from "lucide-react";
import { FileItem } from "./config";
import ptb from 'pretty-bytes'

type FileManagerPreviewPanelProps = {
    activeFile: FileItem | null;
    previewContent: string | null;
    previewSize: number | null;
    previewLoading: boolean;
    previewError: string | null;
    onDownload: (file: FileItem) => void;
    onToggleStar: (file: FileItem) => void;
    onDelete: (file: FileItem) => void;
};

export function FileManagerPreviewPanel({
    activeFile,
    previewContent,
    previewSize,
    previewLoading,
    previewError,
    onDownload,
    onToggleStar,
    onDelete,
}: FileManagerPreviewPanelProps) {
    return (
        <aside className="hidden xl:flex w-80 border-l border-white/10 flex-col bg-slate-950/60">
            <div className="px-4 py-3 border-b border-white/10">
                <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
                    Preview
                </p>
                {activeFile ? (
                    <p className="text-sm font-medium truncate">{activeFile.name}</p>
                ) : (
                    <p className="text-sm text-slate-500">Select a file</p>
                )}
            </div>
            <ScrollArea className="flex-1">
                {activeFile ? (
                    <div className="p-4 space-y-4 text-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                                <FileIcon className="w-5 h-5 text-red-400" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-slate-500">
                                    {activeFile.type || "File"}
                                </span>
                                <span className="text-xs text-slate-400">
                                    Size: {ptb(Number(activeFile.size ?? 0)) ?? ptb(Number(previewSize)) ?? "-"}
                                </span>
                            </div>
                        </div>

                        <Separator className="bg-white/5" />

                        <div className="space-y-1 text-xs text-slate-400">
                            {activeFile.updatedAt && (
                                <p>
                                    <span className="font-semibold text-slate-200">
                                        Updated:
                                    </span>{" "}
                                    {activeFile.updatedAt}
                                </p>
                            )}
                            {activeFile.path && (
                                <p>
                                    <span className="font-semibold text-slate-200">
                                        Location:
                                    </span>{" "}
                                    {activeFile.path}
                                </p>
                            )}
                        </div>

                        <Separator className="bg-white/5" />

                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-300">
                                Quick actions
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs"
                                    onClick={() => onDownload(activeFile)}
                                >
                                    <DownloadCloud className="w-3 h-3 mr-1" />
                                    Download
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs"
                                    onClick={() => onToggleStar(activeFile)}
                                >
                                    <Star className="w-3 h-3 mr-1" />
                                    Star
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs"
                                    onClick={() => onDelete(activeFile)}
                                >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    Move to trash
                                </Button>
                            </div>
                        </div>

                        <Separator className="bg-white/5" />

                        <div className="text-xs text-slate-400">
                            {previewLoading && <p>Loading file content...</p>}
                            {previewError && (
                                <p className="text-red-400">{previewError}</p>
                            )}
                            {!previewLoading && !previewError && previewContent && (
                                <pre className="max-h-[280px] whitespace-pre-wrap break-all bg-slate-900/60 rounded-md p-3 text-[11px]">
                                    {previewContent}
                                </pre>
                            )}
                            {!previewLoading && !previewError && !previewContent && (
                                <p className="text-slate-500">
                                    This file does not have a preview or is a binary file.
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 p-4">
                        Select a file To see the example on the right
                    </p>
                )}
            </ScrollArea>
        </aside>
    );
}
