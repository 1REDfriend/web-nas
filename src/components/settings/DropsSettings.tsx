"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Clock, Download, ExternalLink, Send, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatSize, formatTimeLeft } from "@/lib/file-manager/format";
import { DropInfo, DropList, fetchDrops, removeDropRequest, uploadDrop } from "@/lib/api/user/drop.service";
import { CopyButton } from "@/components/file-manager/CopyButton";

const LIFETIME_CHOICES = [1, 6, 24, 72, 168, 720];
const DOWNLOAD_LIMITS = ["none", "1", "3", "5", "10"];

function hoursLabel(hours: number) {
    if (hours % 24 === 0) {
        const days = hours / 24;
        return `${days} day${days === 1 ? "" : "s"}`;
    }
    return `${hours} hour${hours === 1 ? "" : "s"}`;
}

// What the uploader may pick: common lifetimes up to the admin's maximum, plus the default and the maximum
function lifetimeOptions(limits: DropList["limits"]) {
    const hours = new Set(LIFETIME_CHOICES.filter((h) => h <= limits.maxHours));
    hours.add(limits.defaultHours);
    hours.add(limits.maxHours);
    return [...hours].sort((a, b) => a - b);
}

function UploadPanel({ list, onUploaded }: { list: DropList; onUploaded: (drop: DropInfo) => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [lifetime, setLifetime] = useState(String(list.limits.defaultHours));
    const [limit, setLimit] = useState("none");
    const [dragging, setDragging] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const cancelRef = useRef<(() => void) | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => () => cancelRef.current?.(), []);

    const left = list.quota.limitBytes === null ? null : Math.max(0, list.quota.limitBytes - list.quota.usedBytes);
    const tooBig = file !== null && left !== null && file.size > left;

    function pick(files: FileList | null) {
        setError(null);
        setFile(files?.[0] ?? null);
    }

    async function handleUpload() {
        if (!file) return;
        setError(null);
        setProgress(0);
        const { promise, cancel } = uploadDrop(
            file,
            { expiresIn: `${lifetime}h`, maxDownloads: limit === "none" ? null : Number(limit) },
            setProgress
        );
        cancelRef.current = cancel;
        try {
            const drop = await promise;
            setFile(null);
            if (inputRef.current) inputRef.current.value = "";
            onUploaded(drop);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Upload failed.");
        } finally {
            cancelRef.current = null;
            setProgress(null);
        }
    }

    const uploading = progress !== null;

    return (
        <div className="space-y-4 rounded-lg border border-white/5 bg-slate-900/30 p-3">
            <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (!uploading) pick(e.dataTransfer.files);
                }}
                className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                    dragging ? "border-rose-500 bg-rose-500/10" : "border-white/15 hover:bg-white/5"
                }`}
            >
                <UploadCloud className="h-8 w-8 text-slate-400" />
                {file ? (
                    <span className="break-all text-sm text-slate-100">
                        {file.name} <span className="text-slate-400">({formatSize(file.size)})</span>
                    </span>
                ) : (
                    <span className="text-sm text-slate-300">Drop a file here, or click to choose one</span>
                )}
            </button>
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => pick(e.target.files)} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="drop-lifetime">Link works for</Label>
                    <Select value={lifetime} onValueChange={setLifetime} disabled={uploading}>
                        <SelectTrigger id="drop-lifetime" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {lifetimeOptions(list.limits).map((h) => (
                                <SelectItem key={h} value={String(h)}>{hoursLabel(h)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="drop-limit">Downloads allowed</Label>
                    <Select value={limit} onValueChange={setLimit} disabled={uploading}>
                        <SelectTrigger id="drop-limit" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DOWNLOAD_LIMITS.map((value) => (
                                <SelectItem key={value} value={value}>{value === "none" ? "No limit" : value}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {limit !== "none" && (
                <p className="text-[11px] text-slate-500">
                    With a download limit the file has no preview on its page and cannot be resumed, so every download is counted.
                </p>
            )}

            {uploading && (
                <div className="flex items-center gap-3">
                    <Progress value={progress} className="h-2 flex-1" />
                    <span className="w-10 text-right text-xs text-slate-400">{progress}%</span>
                    <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => cancelRef.current?.()}>
                        <X className="h-4 w-4" />
                        Cancel
                    </Button>
                </div>
            )}

            {tooBig && <p className="text-xs text-red-400">This file is larger than what is left of your quota ({formatSize(left, true)}).</p>}
            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                    {list.quota.limitBytes === null
                        ? `${formatSize(list.quota.usedBytes, true)} in drops`
                        : `${formatSize(list.quota.usedBytes, true)} of ${formatSize(list.quota.limitBytes, true)} used`}
                </p>
                <Button type="button" disabled={!file || uploading || tooBig} onClick={handleUpload} className="gap-1">
                    <Send className="h-4 w-4" />
                    {uploading ? "Uploading..." : "Create link"}
                </Button>
            </div>
        </div>
    );
}

function NewDropPanel({ drop, onDone }: { drop: DropInfo; onDone: () => void }) {
    return (
        <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-sm font-semibold text-emerald-400">Link ready: {drop.name}</p>
            <p className="text-xs text-slate-300">
                Anyone with this link can download the file until {formatDate(drop.expiresAt)}
                {drop.maxDownloads !== null ? `, ${drop.maxDownloads} time${drop.maxDownloads === 1 ? "" : "s"} at most` : ""}.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={drop.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="Drop link" />
                <CopyButton text={drop.url} label="Copy link" />
            </div>
            <div className="flex justify-end">
                <Button type="button" onClick={onDone}>Done</Button>
            </div>
        </div>
    );
}

function DropCard({ drop, now, onRemove }: { drop: DropInfo; now: number; onRemove: (drop: DropInfo) => void }) {
    return (
        <li className="space-y-2 rounded-lg border border-white/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="break-all font-medium text-slate-100">{drop.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(drop.size)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <CopyButton text={drop.url} label="Copy link" />
                    <Button asChild size="sm" variant="ghost" aria-label="Open the drop page">
                        <a href={drop.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" aria-label="Remove" onClick={() => onRemove(drop)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1" title={formatDate(drop.expiresAt)}>
                    <Clock className="h-3.5 w-3.5" />
                    Expires {formatTimeLeft(drop.expiresAt, now)}
                </span>
                <span className="flex items-center gap-1">
                    <Download className="h-3.5 w-3.5" />
                    {drop.maxDownloads === null
                        ? `${drop.downloads} download${drop.downloads === 1 ? "" : "s"}`
                        : `${drop.downloads} of ${drop.maxDownloads} downloads`}
                </span>
            </div>
        </li>
    );
}

export function DropsSettings() {
    const [list, setList] = useState<DropList | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [created, setCreated] = useState<DropInfo | null>(null);
    // `confirm` keeps the last target so the text does not go blank while the dialog fades out
    const [confirm, setConfirm] = useState<DropInfo | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    // State is only set once the request settles, so this is safe to start from an effect
    const load = useCallback(() => {
        return fetchDrops()
            .then((data) => {
                setList(data);
                setNow(Date.now());
                setLoadError(null);
            })
            .catch((err: unknown) => {
                setLoadError(err instanceof Error ? err.message : "Could not load your drops.");
            });
    }, []);

    // Keep "expires in ..." and download counts current while the page is open
    useEffect(() => {
        void load();
        const timer = setInterval(() => void load(), 30000);
        return () => clearInterval(timer);
    }, [load]);

    async function handleConfirmRemove() {
        if (!confirm) return;
        setRemoving(true);
        try {
            await removeDropRequest(confirm.id);
            toast.success(`"${confirm.name}" is no longer shared`);
            if (created?.id === confirm.id) setCreated(null);
            setConfirmOpen(false);
            await load();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not remove the drop.");
        } finally {
            setRemoving(false);
        }
    }

    return (
        <div className="space-y-6">
            {loadError && <p className="text-xs text-red-400">{loadError}</p>}
            {list === null && !loadError && <p className="text-xs text-slate-500">Loading...</p>}

            {list && (created ? (
                <NewDropPanel drop={created} onDone={() => setCreated(null)} />
            ) : (
                <UploadPanel
                    list={list}
                    onUploaded={(drop) => {
                        setCreated(drop);
                        void load();
                    }}
                />
            ))}

            {list && (
                <section className="space-y-2">
                    <p className="text-sm font-semibold text-slate-200">Your drops</p>
                    {list.drops.length === 0 ? (
                        <p className="text-xs text-slate-500">Nothing shared right now.</p>
                    ) : (
                        <ul className="space-y-2">
                            {list.drops.map((drop) => (
                                <DropCard
                                    key={drop.id}
                                    drop={drop}
                                    now={now}
                                    onRemove={(target) => {
                                        setConfirm(target);
                                        setConfirmOpen(true);
                                    }}
                                />
                            ))}
                        </ul>
                    )}
                </section>
            )}

            <AlertDialog open={confirmOpen} onOpenChange={(next) => !removing && !next && setConfirmOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Stop sharing this file?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The link to &quot;{confirm?.name ?? ""}&quot; stops working right away and the file is deleted. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={removing}
                            onClick={(e) => {
                                e.preventDefault();
                                void handleConfirmRemove();
                            }}
                        >
                            {removing ? "Removing..." : "Stop sharing"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
