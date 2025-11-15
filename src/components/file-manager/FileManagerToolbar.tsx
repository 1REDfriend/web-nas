import { Button } from "@/components/ui/button";
import { MoreVertical, DownloadCloud } from "lucide-react";
import { FileListMeta } from "./config";

type FileManagerToolbarProps = {
    title: string;
    visibleCount: number;
    listError: string | null;
    meta: FileListMeta | null;
    page: number;
    totalPages: number;
    listLoading: boolean;
    hasActiveFile: boolean;
    onPrevPage: () => void;
    onNextPage: () => void;
    onDownloadActive: () => void;
};

export function FileManagerToolbar({
    title,
    visibleCount,
    listError,
    meta,
    page,
    totalPages,
    listLoading,
    hasActiveFile,
    onPrevPage,
    onNextPage,
    onDownloadActive,
}: FileManagerToolbarProps) {
    return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-950/40">
            <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="text-xs text-slate-500">
                    {visibleCount} item{visibleCount === 1 ? "" : "s"} in this view
                </p>
                {listError && (
                    <p className="mt-1 text-xs text-red-400">{listError}</p>
                )}
            </div>
            <div className="flex items-center gap-2">
                {meta && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 mr-2">
                        <span>
                            Page {meta.currentPage} / {totalPages}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                disabled={page <= 1 || listLoading}
                                onClick={onPrevPage}
                            >
                                {"<"}
                            </Button>
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                disabled={page >= totalPages || listLoading}
                                onClick={onNextPage}
                            >
                                {">"}
                            </Button>
                        </div>
                    </div>
                )}
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={!hasActiveFile || listLoading}
                    onClick={onDownloadActive}
                >
                    <DownloadCloud className="w-4 h-4" />
                    Download
                </Button>
                <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
