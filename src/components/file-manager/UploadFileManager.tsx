"use client";

import { useState, useRef, useEffect, ChangeEvent } from "react";
import { Upload, X, File as FileIcon, Folder, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { upload } from "@/lib/api/file.service";

interface UploadFileManagerProps {
    currentPath?: string;
    onUploaded?: () => void;
    enableGlobalDrop?: boolean;
}

export function UploadFileManager({
    currentPath = "/",
    onUploaded,
    enableGlobalDrop = true,
}: UploadFileManagerProps) {
    // --- State ---
    const [open, setOpen] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentFileName, setCurrentFileName] = useState<string>("");

    // --- Refs ---
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dirInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);
    const [isDraggingOverWindow, setIsDraggingOverWindow] = useState(false);

    // --- File Handling Helpers ---
    const handleFileSelection = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
        setFiles((prev) => [...prev, ...Array.from(selectedFiles)]);

        e.target.value = "";
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const clearFiles = () => {
        setFiles([]);
        setUploadProgress(0);
        setCurrentFileName("");
    };

    // --- Upload Logic ---
    const handleUpload = async () => {
        if (!files.length) return;

        setIsUploading(true);
        setUploadProgress(0);

        const toastId = toast.loading("Starting upload...", {
            description: `Preparing ${files.length} files.`
        });

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const percent = Math.round(((i) / files.length) * 100);

                setCurrentFileName(file.name);
                setUploadProgress(percent);
                toast.loading(`Uploading: ${file.name}`, {
                    id: toastId,
                    description: `${percent}% completed (${i}/${files.length})`
                });
                await upload(currentPath, file);
            }

            setUploadProgress(100);
            toast.success("Upload Completed", {
                id: toastId,
                description: `Successfully uploaded ${files.length} files.`
            });

            clearFiles();
            setOpen(false);
            if (onUploaded) onUploaded();

        } catch (err) {
            console.error(err);
            toast.error("Upload Failed", {
                id: toastId,
                description: "Something went wrong. Please try again."
            });
        } finally {
            setIsUploading(false);
            setCurrentFileName("");
        }
    };

    // --- Global Drag & Drop Logic ---
    useEffect(() => {
        if (!enableGlobalDrop) return;

        const handleDragEnter = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter.current += 1;
            if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                setIsDraggingOverWindow(true);
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter.current -= 1;
            if (dragCounter.current === 0) {
                setIsDraggingOverWindow(false);
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOverWindow(false);
            dragCounter.current = 0;

            const dt = e.dataTransfer;
            if (!dt) return;

            const droppedFiles: File[] = [];

            if (dt.items) {
                for (let i = 0; i < dt.items.length; i++) {
                    const item = dt.items[i];
                    if (item.kind === 'file') {
                        const file = item.getAsFile();
                        if (file) droppedFiles.push(file);
                    }
                }
            } else {
                for (let i = 0; i < dt.files.length; i++) {
                    droppedFiles.push(dt.files[i]);
                }
            }

            if (droppedFiles.length > 0) {
                setFiles((prev) => [...prev, ...droppedFiles]);
                setOpen(true);
            }
        };

        window.addEventListener("dragenter", handleDragEnter);
        window.addEventListener("dragleave", handleDragLeave);
        window.addEventListener("dragover", handleDragOver);
        window.addEventListener("drop", handleDrop);

        return () => {
            window.removeEventListener("dragenter", handleDragEnter);
            window.removeEventListener("dragleave", handleDragLeave);
            window.removeEventListener("dragover", handleDragOver);
            window.removeEventListener("drop", handleDrop);
        };
    }, [enableGlobalDrop]);


    // --- Render ---
    return (
        <>
            {/* 1. Global Drop Overlay (แสดงเมื่อลากไฟล์เข้ามาในหน้าเว็บ) */}
            {isDraggingOverWindow && (
                <div className=" absolute inset-0 z-9999 flex w-full min-h-screen items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl">
                    <div className="text-center pointer-events-none">
                        <Upload className="mx-auto h-12 w-12 text-primary animate-bounce" />
                        <h3 className="mt-2 text-xl font-bold">Drop files to upload</h3>
                        <p className="text-muted-foreground">Add to {currentPath}</p>
                    </div>
                </div>
            )}

            {/* 2. Main Dialog Component */}
            <Dialog open={open} onOpenChange={(o) => {
                if (isUploading && !o) {
                    toast("Upload is running in background");
                    setOpen(o);
                } else {
                    setOpen(o);
                }
            }}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="icon" className="relative shrink-0">
                        <Upload className="w-4 h-4" />
                        {isUploading && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </span>
                        )}
                    </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Upload Manager</DialogTitle>
                        <DialogDescription>
                            Upload files to <span className="font-mono bg-muted px-1 rounded">{currentPath}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <input
                                ref={fileInputRef}
                                type="file" multiple className="hidden"
                                onChange={handleFileSelection}
                            />
                            <input
                                ref={dirInputRef}
                                type="file" multiple className="hidden"
                                // @ts-expect-error: webkitdirectory non-standard but supported
                                webkitdirectory="" directory=""
                                onChange={handleFileSelection}
                            />

                            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex-1">
                                <FileIcon className="mr-2 h-4 w-4" /> Add Files
                            </Button>
                            <Button variant="secondary" onClick={() => dirInputRef.current?.click()} disabled={isUploading} className="flex-1">
                                <Folder className="mr-2 h-4 w-4" /> Add Folder
                            </Button>
                        </div>

                        {/* File List Area */}
                        <div className="border rounded-md">
                            <div className="bg-muted/50 p-2 text-xs font-medium text-muted-foreground border-b flex justify-between">
                                <span>Queue ({files.length})</span>
                                {files.length > 0 && !isUploading && (
                                    <button onClick={clearFiles} className="text-red-500 hover:underline">Clear all</button>
                                )}
                            </div>
                            <ScrollArea className="h-[200px] p-2">
                                {files.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm opacity-50">
                                        <Upload className="h-8 w-8 mb-2" />
                                        <p>No files selected</p>
                                        <p className="text-xs">Drag & drop here</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {files.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-sm bg-card p-2 rounded border group">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileIcon className="h-4 w-4 shrink-0 text-blue-500" />
                                                    <div className="flex flex-col truncate">
                                                        <span className="truncate font-medium">{file.name}</span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {(file.size / 1024).toFixed(1)} KB
                                                            {/* Check if this specific file is uploading (Simple Check) */}
                                                            {isUploading && file.name === currentFileName && (
                                                                <span className="text-blue-500 ml-2">Uploading...</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                                {!isUploading && (
                                                    <Button
                                                        variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => removeFile(idx)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                )}
                                                {isUploading && file.name === currentFileName && (
                                                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>

                        {/* Progress Bar (Overall) */}
                        {isUploading && (
                            <div className="space-y-1 animate-in fade-in zoom-in slide-in-from-bottom-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Uploading...</span>
                                    <span>{uploadProgress}%</span>
                                </div>
                                <Progress value={uploadProgress} className="h-2" />
                                <p className="text-[10px] text-muted-foreground truncate">
                                    Current: {currentFileName}
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)} disabled={isUploading}>
                            Close
                        </Button>
                        <Button onClick={handleUpload} disabled={isUploading || files.length === 0}>
                            {isUploading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading
                                </>
                            ) : (
                                "Upload Files"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}