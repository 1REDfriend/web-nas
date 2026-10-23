"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, File as FileIcon, Folder, Info, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileItem } from "./config";
import { FileDetails, FilePreviewState } from "./FileDetails";
import type { FileAction } from "@/lib/file-manager/fileActions";
import { formatDate, formatSize } from "@/lib/file-manager/format";

type FileActionSheetProps = {
    file: FileItem | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // From getFileActions(file, ...)
    actions: FileAction[];
    preview?: FilePreviewState;
    mediaSrc?: string;
    // Open with the details already expanded (a tap on a file, rather than a long press).
    // Read once: give the sheet a new `key` each time it opens.
    defaultShowInfo?: boolean;
    // See FileDetails
    inTrash?: boolean;
};

// What a long press, right-click or the ⋮ button opens: the file's name and
// summary on top, its details one tap away, then every action as a big row.
// Slides up from the bottom on phones, sits in the middle on wider screens.
export function FileActionSheet({ file, open, onOpenChange, actions, preview, mediaSrc, defaultShowInfo = false, inTrash }: FileActionSheetProps) {
    const [showInfo, setShowInfo] = useState(defaultShowInfo);

    function runAction(action: FileAction) {
        // Close first so a dialog the action opens (rename, share, delete) takes focus cleanly
        onOpenChange(false);
        action.run();
    }

    const isDirectory = file?.type === "directory";
    const summary = [file?.type || "File", !isDirectory && formatSize(file?.size), formatDate(file?.updatedAt)]
        .filter(Boolean)
        .join(" · ");

    return (
        <DialogPrimitive.Root open={open && !!file} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60" />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed z-50 flex max-h-[85dvh] w-full flex-col border border-slate-800/80 bg-slate-900/95 text-slate-50 shadow-xl shadow-black/40 backdrop-blur-md duration-200",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        // Phone: bottom sheet
                        "inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
                        // Wider: centered card
                        "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
                    )}
                >
                    {file && (
                        <>
                            {/* Grab handle: tells phone users this is a sheet */}
                            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-700 sm:hidden" />

                            <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/20">
                                    {isDirectory ? (
                                        <Folder className="h-5 w-5 text-red-400" />
                                    ) : (
                                        <FileIcon className="h-5 w-5 text-red-300" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    {/* Full name, wrapped: the grid cuts long names short */}
                                    <DialogPrimitive.Title className="break-all text-sm font-semibold leading-snug">
                                        {file.name}
                                    </DialogPrimitive.Title>
                                    <DialogPrimitive.Description className="text-xs text-slate-400">
                                        {summary}
                                    </DialogPrimitive.Description>
                                </div>
                                <DialogPrimitive.Close className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                                    <XIcon className="h-5 w-5" />
                                    <span className="sr-only">Close</span>
                                </DialogPrimitive.Close>
                            </div>

                            <div className="overflow-y-auto overscroll-contain py-1">
                                <button
                                    type="button"
                                    onClick={() => setShowInfo((v) => !v)}
                                    aria-expanded={showInfo}
                                    className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm text-slate-100 hover:bg-slate-800/80"
                                >
                                    <Info className="h-4 w-4 text-slate-400" />
                                    <span className="flex-1">Info</span>
                                    <ChevronDown className={cn("h-4 w-4 text-slate-500 transition", showInfo && "rotate-180")} />
                                </button>
                                {showInfo && (
                                    <div className="px-4 pb-3 pt-1">
                                        <FileDetails file={file} preview={preview} mediaSrc={mediaSrc} inTrash={inTrash} hideSummary />
                                    </div>
                                )}

                                {actions.map((action, i) => {
                                    const Icon = action.icon;
                                    return (
                                        <div key={action.id}>
                                            {(action.groupStart || i === 0) && <div className="my-1 h-px bg-slate-800/80" />}
                                            <button
                                                type="button"
                                                onClick={() => runAction(action)}
                                                className={cn(
                                                    "flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-slate-800/80",
                                                    action.destructive ? "text-red-400" : "text-slate-100",
                                                )}
                                            >
                                                <Icon className={cn("h-4 w-4", !action.destructive && "text-slate-400")} />
                                                <span>{action.label}</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
