import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FileItem } from "./config";
import { FileDetails } from "./FileDetails";
import { FileActionId, getFileActions } from "@/lib/file-manager/fileActions";

// The side panel keeps a short row of buttons; the full list lives in the menus
const QUICK_ACTIONS: readonly FileActionId[] = ["download", "star", "restore", "delete"];

type FileManagerPreviewPanelProps = {
    activeFile: FileItem | null;
    previewContent: string | null;
    previewSize: number | null;
    previewLoading: boolean;
    previewError: string | null;
    onDownload: (file: FileItem) => void;
    onToggleStar: (file: FileItem) => void;
    onDelete: (file: FileItem) => void;
    onRestore?: (file: FileItem) => void;
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
    onRestore,
}: FileManagerPreviewPanelProps) {
    const actions = activeFile
        ? getFileActions(
              activeFile,
              { download: onDownload, star: onToggleStar, delete: onDelete, restore: onRestore },
              QUICK_ACTIONS,
          )
        : [];

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
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-300">
                                Quick actions
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {actions.map(({ id, label, icon: Icon, destructive, run }) => (
                                    <Button
                                        key={id}
                                        size="sm"
                                        variant="outline"
                                        className={`text-xs ${destructive ? "text-red-400 hover:text-red-300 border-red-900/50 hover:bg-red-950/30" : ""}`}
                                        onClick={run}
                                    >
                                        <Icon className="w-3 h-3 mr-1" />
                                        {label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <Separator className="bg-white/5" />

                        <FileDetails
                            file={activeFile}
                            preview={{
                                content: previewContent,
                                size: previewSize,
                                loading: previewLoading,
                                error: previewError,
                            }}
                        />
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 p-4">
                        Select a file to see its details here
                    </p>
                )}
            </ScrollArea>
        </aside>
    );
}
