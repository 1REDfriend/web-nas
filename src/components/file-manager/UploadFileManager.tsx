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

        // Reset เพื่อให้เลือกไฟล์เดิมซ้ำได้
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
    async function scanFiles(entry: FileSystemEntry, path = ""): Promise<File[]> {
        if (entry.isFile) {
            const fileEntry = entry as FileSystemFileEntry;
            return new Promise((resolve) => {
                fileEntry.file((file: File) => {
                    const fullPath = path + file.name;
                    Object.defineProperty(file, "webkitRelativePath", {
                        value: fullPath,
                    });
                    resolve([file]);
                });
            });
        } else if (entry.isDirectory) {
            const dirEntry = entry as FileSystemDirectoryEntry;
            const dirReader = dirEntry.createReader();

            const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
                dirReader.readEntries(
                    (results) => resolve(results),
                    (err) => reject(err)
                );
            });

            const files: File[] = [];
            for (const childEntry of entries) {
                const childFiles = await scanFiles(childEntry, path + entry.name + "/");
                files.push(...childFiles);
            }
            return files;
        }
        return [];
    }

    // --- Upload Logic (Key Change Here) ---
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

                const relativePath = file.webkitRelativePath as string;
                let targetDirectory = currentPath;

                if (relativePath) {
                    const pathParts = relativePath.split('/');
                    if (pathParts.length > 1) {
                        pathParts.pop();
                        const folderStructure = pathParts.join('/');
                        const base = currentPath === '/' ? '' : currentPath;
                        targetDirectory = `${base}/${folderStructure}`;
                    }
                }

                // Update UI display
                const displayName = relativePath || file.name;
                setCurrentFileName(displayName);
                setUploadProgress(percent);

                toast.loading(`Uploading: ${displayName}`, {
                    id: toastId,
                    description: `${percent}% completed`
                });
                await upload(targetDirectory, file);
            }

            setUploadProgress(100);
            toast.success("Upload Completed", {
                id: toastId,
                description: `Successfully uploaded ${files.length} items.`
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
            if (e.dataTransfer?.items?.length) {
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

        const handleDrop = async (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOverWindow(false);
            dragCounter.current = 0;

            const dt = e.dataTransfer;
            if (!dt || !dt.items) return;

            const droppedFiles: File[] = [];
            const promises: Promise<File[]>[] = [];

            for (let i = 0; i < dt.items.length; i++) {
                const item = dt.items[i];
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry() as FileSystemEntry | null;
                    if (entry) {
                        promises.push(scanFiles(entry));
                    }
                }
            }

            const results = await Promise.all(promises);

            for (const res of results) {
                droppedFiles.push(...res);
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
    }, [enableGlobalDrop, scanFiles]);


    return (
        <>
            {/* Global Drop Overlay */}
            {isDraggingOverWindow && (
                <div className="fixed inset-0 z-9999 min-h-screen flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl">
                    <div className="text-center pointer-events-none">
                        <Upload className="mx-auto h-12 w-12 text-primary animate-bounce" />
                        <h3 className="mt-2 text-xl font-bold">Drop files to upload</h3>
                        <p className="text-muted-foreground">Add to {currentPath}</p>
                    </div>
                </div>
            )}

            {/* Main Dialog */}
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

                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Upload Manager</DialogTitle>
                        <DialogDescription>
                            Upload to <span className="font-mono bg-muted px-1 rounded">{currentPath}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="flex gap-2">
                            <input
                                ref={fileInputRef}
                                type="file" multiple className="hidden"
                                onChange={handleFileSelection}
                            />
                            <input
                                ref={dirInputRef}
                                type="file" multiple className="hidden"
                                // @ts-expect-error: standard webkit attribute
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

                        {/* File List */}
                        <div className="border rounded-md">
                            <div className="bg-muted/50 p-2 text-xs font-medium text-muted-foreground border-b flex justify-between">
                                <span>Queue ({files.length})</span>
                                {files.length > 0 && !isUploading && (
                                    <button onClick={clearFiles} className="text-red-500 hover:underline">Clear all</button>
                                )}
                            </div>
                            <ScrollArea className="h-[250px] p-2">
                                {files.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm opacity-50 min-h-[150px]">
                                        <Upload className="h-8 w-8 mb-2" />
                                        <p>No files selected</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {files.map((file, idx) => {
                                            const relPath = file.webkitRelativePath || file.name;

                                            return (
                                                <div key={idx} className="flex items-center justify-between text-sm bg-card p-2 rounded border group">
                                                    <div className="flex items-center gap-2 overflow-hidden w-full">
                                                        {/* Icon เปลี่ยนตามว่าเป็นไฟล์ใน Folder หรือไฟล์เดี่ยว */}
                                                        {relPath.includes('/') ? <Folder className="h-4 w-4 shrink-0 text-yellow-500" /> : <FileIcon className="h-4 w-4 shrink-0 text-blue-500" />}

                                                        <div className="flex flex-col truncate w-full">
                                                            <span className="truncate font-medium pr-2" title={relPath}>
                                                                {relPath}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground flex justify-between w-full pr-2">
                                                                <span>{(file.size / 1024).toFixed(1)} KB</span>
                                                                {isUploading && file.name === currentFileName && (
                                                                    <span className="text-blue-500 font-bold">Uploading...</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {!isUploading && (
                                                        <Button
                                                            variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                            onClick={() => removeFile(idx)}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>

                        {/* Progress Bar */}
                        {isUploading && (
                            <div className="space-y-1 animate-in fade-in zoom-in slide-in-from-bottom-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Uploading...</span>
                                    <span>{uploadProgress}%</span>
                                </div>
                                <Progress value={uploadProgress} className="h-2" />
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