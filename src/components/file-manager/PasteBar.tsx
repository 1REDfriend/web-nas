"use client";

import { ClipboardPaste, X } from "lucide-react";
import type { ClipboardItem } from "@/lib/file-manager/useFileClipboard";

type PasteBarProps = {
    clipboard: ClipboardItem | null;
    onPaste: () => void;
    onCancel: () => void;
};

// Touch screens have no Ctrl+V or right-click on the background: after Copy or
// Cut, this bar waits at the bottom until the user opens the target folder and
// taps Paste. Mouse users keep the toast and the keyboard shortcut.
export function PasteBar({ clipboard, onPaste, onCancel }: PasteBarProps) {
    if (!clipboard) return null;

    const count = clipboard.files.length;
    const what = count === 1 ? `"${clipboard.files[0].name}"` : `${count} items`;

    return (
        <div
            role="status"
            // Leaves room for the "+" button on phones
            className="hidden pointer-coarse:flex fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-3 right-[5.5rem] sm:right-3 z-40 mx-auto max-w-md items-center gap-1 rounded-2xl border border-slate-700/80 bg-slate-900/95 py-1 pl-4 pr-1 text-sm text-slate-100 shadow-lg shadow-black/40 backdrop-blur-md"
        >
            <span className="min-w-0 flex-1 truncate">
                {clipboard.action === "move" ? "Move" : "Copy"} {what}
            </span>
            <button
                type="button"
                onClick={onPaste}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-medium text-red-300 hover:bg-white/10"
            >
                <ClipboardPaste className="h-4 w-4" />
                Paste here
            </button>
            <button
                type="button"
                aria-label="Cancel"
                onClick={onCancel}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
