import { Separator } from "@/components/ui/separator";
import { File as FileIcon, Folder } from "lucide-react";
import { FileItem } from "./config";
import { mediaTypeOf, rawFileUrl } from "@/lib/file-manager/media";
import { isTrashItem } from "@/lib/file-manager/fileActions";
import { formatDate, formatSize } from "@/lib/file-manager/format";
import { MediaPreview } from "./MediaPreview";

export type FilePreviewState = {
    content: string | null;
    size: number | null;
    loading: boolean;
    error: string | null;
};

type FileDetailsProps = {
    file: FileItem;
    // Text preview from useFilePreview; omit where there is none (e.g. share pages)
    preview?: FilePreviewState;
    // Where media is streamed from; defaults to the logged-in raw endpoint
    mediaSrc?: string;
    // Leave out the icon/type/size header when the surrounding UI already shows it
    hideSummary?: boolean;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <p className="break-all">
            <span className="font-semibold text-slate-200">{label}:</span> {children}
        </p>
    );
}

// Everything we know about one file: type, size, dates, location and a preview.
// Shown in the desktop side panel and in the action sheet on small screens.
export function FileDetails({ file, preview, mediaSrc, hideSummary = false }: FileDetailsProps) {
    const isDirectory = file.type === "directory";
    const inTrash = isTrashItem(file);
    const media = !isDirectory ? mediaTypeOf(file.name) : null;
    const size = formatSize(file.size) ?? formatSize(preview?.size);

    return (
        <div className="space-y-4 text-sm">
            {!hideSummary && (
                <>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 shrink-0 rounded-lg bg-red-500/20 flex items-center justify-center">
                            {isDirectory ? (
                                <Folder className="w-5 h-5 text-red-400" />
                            ) : (
                                <FileIcon className="w-5 h-5 text-red-400" />
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-500">{file.type || "File"}</span>
                            {!isDirectory && (
                                <span className="text-xs text-slate-400">
                                    Size: {size ?? "-"}
                                </span>
                            )}
                        </div>
                    </div>

                    <Separator className="bg-white/5" />
                </>
            )}

            <div className="space-y-1 text-xs text-slate-400">
                <Row label="Name">{file.name}</Row>
                {file.updatedAt && <Row label="Updated">{formatDate(file.updatedAt)}</Row>}
                {inTrash ? (
                    <>
                        <Row label="Deleted from">{file.originalPath ?? "Unknown"}</Row>
                        {file.expiresAt && (
                            <Row label="Deleted for good on">
                                {new Date(file.expiresAt).toLocaleDateString()}
                            </Row>
                        )}
                    </>
                ) : (
                    file.path && <Row label="Location">{file.path}</Row>
                )}
            </div>

            {!isDirectory && (
                <>
                    <Separator className="bg-white/5" />
                    <div className="text-xs text-slate-400">
                        {media && !inTrash ? (
                            <MediaPreview
                                key={file.path}
                                src={mediaSrc ?? rawFileUrl(file.path)}
                                name={file.name}
                                kind={media.kind}
                            />
                        ) : preview ? (
                            <>
                                {preview.loading && <p>Loading file content...</p>}
                                {preview.error && <p className="text-red-400">{preview.error}</p>}
                                {!preview.loading && !preview.error && preview.content && (
                                    <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap break-all bg-slate-900/60 rounded-md p-3 text-[11px]">
                                        {preview.content}
                                    </pre>
                                )}
                                {!preview.loading && !preview.error && !preview.content && (
                                    <p className="text-slate-500">
                                        This file does not have a preview or is a binary file.
                                    </p>
                                )}
                            </>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
}
