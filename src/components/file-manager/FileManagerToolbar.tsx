import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowUp, ChevronRight, DownloadCloud, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewModeMenu } from "./ViewModeMenu";
import type { ViewMode } from "@/lib/file-manager/useViewMode";
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
import { FileListMeta } from "./config";

export type Crumb = { label: string; onClick: () => void };

type FileManagerToolbarProps = {
    // Root first ("All files", "Starred"...), then each folder down to the open one
    crumbs: Crumb[];
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
    // Only passed while the trash is open
    onEmptyTrash?: () => Promise<void>;
    view: ViewMode;
    onViewChange: (mode: ViewMode) => void;
};

export function FileManagerToolbar({
    crumbs,
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
    onEmptyTrash,
    view,
    onViewChange,
}: FileManagerToolbarProps) {
    const [confirmEmpty, setConfirmEmpty] = useState(false);
    const [emptying, setEmptying] = useState(false);

    async function handleConfirmEmpty() {
        if (!onEmptyTrash) return;
        setEmptying(true);
        await onEmptyTrash();
        setEmptying(false);
        setConfirmEmpty(false);
    }

    return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3 border-b border-white/10 bg-slate-950/40">
            <div className="min-w-0 flex-1">
                <nav aria-label="Folder path" className="flex items-center gap-0.5 text-sm">
                    {crumbs.length > 1 && (
                        <button
                            type="button"
                            aria-label="Up one folder"
                            onClick={crumbs[crumbs.length - 2].onClick}
                            className="-ml-2 mr-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-slate-100"
                        >
                            <ArrowUp className="h-4 w-4" />
                        </button>
                    )}
                    {/* Long paths scroll sideways instead of wrapping */}
                    <ol className="flex min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
                        {crumbs.map((crumb, i) => {
                            const isLast = i === crumbs.length - 1;
                            return (
                                <li key={i} className="flex items-center gap-0.5">
                                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />}
                                    {isLast ? (
                                        <h2 aria-current="page" className="font-semibold">{crumb.label}</h2>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={crumb.onClick}
                                            className="rounded px-1 py-1 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                                        >
                                            {crumb.label}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </nav>
                <p className="text-xs text-slate-500">
                    {visibleCount} item{visibleCount === 1 ? "" : "s"} in this view
                </p>
                {listError && (
                    <p className="mt-1 text-xs text-red-400">{listError}</p>
                )}
                {meta?.truncated && (
                    <p className="mt-1 text-xs text-amber-400">
                        Showing the first matches only. Type more of the name to narrow the search.
                    </p>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <ViewModeMenu value={view} onChange={onViewChange} />
                {meta && (
                    // Phones only show the pager when there is more than one page
                    <div className={cn("items-center gap-2 text-xs text-slate-400 sm:mr-2", totalPages > 1 ? "flex" : "hidden sm:flex")}>
                        <span>
                            Page {page} / {totalPages}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-9 w-9 sm:h-7 sm:w-7"
                                aria-label="Previous page"
                                disabled={page <= 1 || listLoading}
                                onClick={onPrevPage}
                            >
                                {"<"}
                            </Button>
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-9 w-9 sm:h-7 sm:w-7"
                                aria-label="Next page"
                                disabled={page >= totalPages || listLoading}
                                onClick={onNextPage}
                            >
                                {">"}
                            </Button>
                        </div>
                    </div>
                )}
                {onEmptyTrash && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-red-400 border-red-900/50 hover:bg-red-950/30 hover:text-red-300"
                        disabled={visibleCount === 0 || listLoading}
                        onClick={() => setConfirmEmpty(true)}
                        aria-label="Empty trash"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Empty trash</span>
                    </Button>
                )}
                {/* Phones download from the file's action sheet */}
                <Button
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex gap-2"
                    disabled={!hasActiveFile || listLoading}
                    onClick={onDownloadActive}
                >
                    <DownloadCloud className="w-4 h-4" />
                    Download
                </Button>
            </div>

            <AlertDialog open={confirmEmpty} onOpenChange={(open) => !emptying && setConfirmEmpty(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Empty trash?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Everything in your trash will be deleted permanently. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={emptying}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void handleConfirmEmpty();
                            }}
                            disabled={emptying}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {emptying ? "Deleting..." : "Delete forever"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
