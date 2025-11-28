"use client";

import { useCallback, useEffect, useState } from "react";
import * as fileService from "@/lib/api/file.service";
import { logerror } from "@/lib/logger";
import { FileItem } from "@/components/file-manager/config";
import { toast } from "sonner";

type ClipboardAction = "move" | "copy";

type ClipboardItem = {
    files: FileItem[];
    action: ClipboardAction;
};

type UseFileClipboardParams = {
    urlPath: string | null;
    refetchFiles: () => void;
};

type UseFileClipboardResult = {
    handleCut: (file: FileItem) => void;
    handleCopy: (file: FileItem) => void;
    handlePaste: () => Promise<void>;
};

export function useFileClipboard({
    urlPath,
    refetchFiles,
}: UseFileClipboardParams): UseFileClipboardResult {
    const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);

    const handlePaste = useCallback(async () => {
        if (!clipboard) return;

        const destination = urlPath ?? "/";
        const toastId = toast.loading(`Pasting ${clipboard.files.length} files...`);

        try {
            const { errors } = await fileService.pasteFiles(
                clipboard.files.map((f) => ({ path: f.path, name: f.name })),
                destination,
                clipboard.action
            );

            if (errors.length > 0) {
                toast.error("Some files failed to paste", {
                    id: toastId,
                    description:
                        errors.slice(0, 3).join(", ") +
                        (errors.length > 3 ? "..." : ""),
                });
            } else {
                toast.success("Files pasted successfully", { id: toastId });

                if (clipboard.action === "move") {
                    setClipboard(null);
                    toast.dismiss("clipboard-toast");
                }

                refetchFiles();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to paste";
            logerror(msg);
            toast.error(msg, { id: toastId });
        }
    }, [clipboard, urlPath, refetchFiles]);

    const handleAddToClipboard = useCallback(
        (filesToClip: FileItem[], action: ClipboardAction) => {
            setClipboard({ files: filesToClip, action });

            toast.message(
                action === "move" ? "Ready to Move" : "Copied to Clipboard",
                {
                    id: "clipboard-toast",
                    description: `${filesToClip.length} file(s) selected. Go to destination and press Ctrl+V.`,
                    duration: Infinity,
                    action: {
                        label: "Cancel",
                        onClick: () => {
                            setClipboard(null);
                            toast.dismiss("clipboard-toast");
                        },
                    },
                }
            );
        },
        []
    );

    const handleCut = (file: FileItem) => handleAddToClipboard([file], "move");
    const handleCopy = (file: FileItem) => handleAddToClipboard([file], "copy");

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                document.activeElement?.tagName === "INPUT" ||
                document.activeElement?.tagName === "TEXTAREA"
            ) {
                return;
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
                if (clipboard) {
                    e.preventDefault();
                    void handlePaste();
                }
            }

            if (e.key === "Escape" && clipboard) {
                setClipboard(null);
                toast.dismiss("clipboard-toast");
                toast.info("Clipboard cleared");
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [clipboard, handlePaste]);

    return {
        handleCut,
        handleCopy,
        handlePaste,
    };
}
