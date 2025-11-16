"use client";

import {
    useState,
    useRef,
    useEffect,
    ChangeEvent,
} from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { upload } from "@/lib/api/file.service";
import { logerror } from "@/lib/logger";

interface UploadDialogProps {
    currentPath: string;
    onUploaded?: () => void;
    triggerLabel?: string;
    triggerEnable?: boolean;
    enableGlobalDrop?: boolean;
}

export function UploadDialog({
    currentPath,
    onUploaded,
    triggerLabel = "Upload",
    triggerEnable = true,
    enableGlobalDrop = true,
}: UploadDialogProps) {
    const [open, setOpen] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const dirInputRef = useRef<HTMLInputElement | null>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const list = e.target.files;
        if (!list) return;
        setFiles(Array.from(list));
        setError(null);
        setProgress(0);
    };

    const doUploadFiles = async (fileList: File[]) => {
        if (!fileList.length) {
            setError("Please select files or a directory first.");
            return;
        }

        setIsUploading(true);
        setError(null);
        setProgress(0);

        try {
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                await upload(currentPath, file);
                setProgress(Math.round(((i + 1) / fileList.length) * 100));
            }

            setFiles([]);
            setOpen(false);
            setProgress(0);
            if (onUploaded) onUploaded();
        } catch (err) {
            setError("Upload failed. Please try again.");
            logerror("[UploadDialog] Upload error:" +  err);
        } finally {
            setIsUploading(false);
        }
    };

    const handleUpload = async () => {
        await doUploadFiles(files);
    };

    // Global drag & drop handling
    useEffect(() => {
        if (!enableGlobalDrop) return;

        const handleDragOver = (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "copy";
            }
        };

        const handleDragEnter = (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            dragCounter.current += 1;
            setIsDragging(true);
        };

        const handleDragLeave = (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            dragCounter.current -= 1;
            if (dragCounter.current <= 0) {
                setIsDragging(false);
                dragCounter.current = 0;
            }
        };

        const handleDrop = async (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            dragCounter.current = 0;
            setIsDragging(false);

            const dt = event.dataTransfer;
            if (!dt) return;

            const droppedFiles: File[] = [];

            if (dt.items && dt.items.length > 0) {
                for (let i = 0; i < dt.items.length; i++) {
                    const item = dt.items[i];
                    if (item.kind === "file") {
                        const file = item.getAsFile();
                        if (file) droppedFiles.push(file);
                    }
                }
            } else if (dt.files && dt.files.length > 0) {
                for (let i = 0; i < dt.files.length; i++) {
                    droppedFiles.push(dt.files[i]);
                }
            }

            if (!droppedFiles.length) return;

            // Directly upload dropped files to currentPath
            await doUploadFiles(droppedFiles);
        };

        window.addEventListener("dragover", handleDragOver);
        window.addEventListener("dragenter", handleDragEnter);
        window.addEventListener("dragleave", handleDragLeave);
        window.addEventListener("drop", handleDrop);

        return () => {
            window.removeEventListener("dragover", handleDragOver);
            window.removeEventListener("dragenter", handleDragEnter);
            window.removeEventListener("dragleave", handleDragLeave);
            window.removeEventListener("drop", handleDrop);
        };
    }, [enableGlobalDrop, currentPath, onUploaded]);

    return (
        <>
            {/* Global drag overlay */}
            {enableGlobalDrop && isDragging && (
                <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur">
                    <div className="rounded-xl border border-dashed border-primary px-6 py-4 text-center text-sm shadow-lg">
                        <p className="font-medium">Drop files to upload</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            They will be uploaded to {currentPath || "/"}
                        </p>
                    </div>
                </div>
            )}

            <Dialog
                open={open}
                onOpenChange={(o) => {
                    if (!isUploading) {
                        setOpen(o);
                        if (!o) {
                            setFiles([]);
                            setError(null);
                            setProgress(0);
                        }
                    }
                }}
            >
                {triggerEnable ?? (
                    <DialogTrigger asChild>
                        <Button variant="outline">{triggerLabel}</Button>
                    </DialogTrigger>
                )}

                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Upload files</DialogTitle>
                        <DialogDescription>
                            Select files or a directory to upload to
                            <span className="font-mono ml-1 text-xs bg-muted px-1 py-0.5 rounded">
                                {currentPath || "/"}
                            </span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* File & directory selectors */}
                        <div className="flex gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <input
                                ref={dirInputRef}
                                type="file"
                                multiple
                                // @ts-expect-error: webkitdirectory is not in the standard type definition
                                webkitdirectory=""
                                directory=""
                                className="hidden"
                                onChange={handleFileChange}
                            />

                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                            >
                                Choose files…
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => dirInputRef.current?.click()}
                                disabled={isUploading}
                            >
                                Choose directory…
                            </Button>
                        </div>

                        {/* Selected files list */}
                        {files.length > 0 && (
                            <div className="max-h-40 overflow-auto rounded border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                                <p className="mb-1 text-[11px] text-muted-foreground">
                                    Selected {files.length} item(s):
                                </p>
                                <ul className="space-y-0.5">
                                    {files.map((file, idx) => {
                                        const anyFile = file as File;
                                        const relPath = anyFile.webkitRelativePath || file.name;
                                        return (
                                            <li key={idx} className="truncate">
                                                {relPath}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* Progress bar */}
                        {isUploading && (
                            <div className="space-y-1">
                                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Uploading… {progress}%
                                </p>
                            </div>
                        )}

                        {/* Error message */}
                        {error && (
                            <p className="text-xs text-red-500">
                                {error}
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            disabled={isUploading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleUpload}
                            disabled={isUploading || files.length === 0}
                        >
                            {isUploading ? "Uploading…" : "Upload"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
