"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Inbox, Link2Off, Loader2, Lock, UploadCloud, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatSize, formatTimeLeft } from "@/lib/file-manager/format";
import { PublicInbox, fetchPublicInbox, sendToInbox, unlockPublicInbox } from "@/lib/api/user/inbox.service";

type QueueItem = {
    key: number;
    file: File;
    state: "waiting" | "sending" | "done" | "failed";
    progress: number;
    message?: string;
};

const CLOSED_TEXT: Record<string, string> = {
    closed: "This link is not taking files right now.",
    full: "This link has received all the files it can take.",
};

function extensionOf(name: string) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// A reason the file would be refused, checked before sending it
function precheck(file: File, inbox: PublicInbox): string | null {
    if (inbox.allowedExt && !inbox.allowedExt.includes(extensionOf(file.name))) {
        return `Only ${inbox.allowedExt.map((e) => "." + e).join(", ")} files are accepted.`;
    }
    if (inbox.maxFileBytes && file.size > Number(inbox.maxFileBytes)) {
        return `Larger than ${formatSize(inbox.maxFileBytes, true)}, the most this link accepts.`;
    }
    return null;
}

function PasswordForm({ link, onUnlocked }: { link: string; onUnlocked: (inbox: PublicInbox) => void }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            onUnlocked(await unlockPublicInbox(link, password));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Could not unlock.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-slate-300">
                <Lock className="h-4 w-4" />
                This link needs a password.
            </p>
            <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !password}>
                {busy ? "Checking..." : "Unlock"}
            </Button>
        </form>
    );
}

function QueueRow({ item, onCancel }: { item: QueueItem; onCancel: () => void }) {
    return (
        <li className="space-y-1 rounded-md border border-white/10 p-2">
            <div className="flex items-center gap-2">
                {item.state === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                {item.state === "failed" && <XCircle className="h-4 w-4 shrink-0 text-red-400" />}
                {(item.state === "waiting" || item.state === "sending") && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-100" title={item.file.name}>{item.file.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatSize(item.file.size, true)}</span>
                {item.state === "sending" && (
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-1" aria-label="Cancel" onClick={onCancel}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
            {item.state === "sending" && <Progress value={item.progress} className="h-1.5" />}
            {item.message && (
                <p className={`text-xs ${item.state === "failed" ? "text-red-400" : "text-slate-400"}`}>{item.message}</p>
            )}
        </li>
    );
}

// Public page behind /u/<link>: anyone with the link can send files to its owner
export function InboxPage({ link }: { link: string }) {
    const [inbox, setInbox] = useState<PublicInbox | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sender, setSender] = useState("");
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [dragging, setDragging] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const inputRef = useRef<HTMLInputElement>(null);
    const cancelRef = useRef<(() => void) | null>(null);
    const keyRef = useRef(0);
    const busyRef = useRef(false);

    const reload = useCallback(() => {
        return fetchPublicInbox(link)
            .then((data) => {
                setInbox(data);
                setError(null);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not reach the server. Try again later."));
    }, [link]);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => {
            clearInterval(timer);
            cancelRef.current?.();
        };
    }, []);

    // Sends the waiting files one at a time
    useEffect(() => {
        if (busyRef.current) return;
        const next = queue.find((q) => q.state === "waiting");
        if (!next) return;

        busyRef.current = true;
        const update = (patch: Partial<QueueItem>) =>
            setQueue((list) => list.map((q) => (q.key === next.key ? { ...q, ...patch } : q)));
        update({ state: "sending", progress: 0 });

        const { promise, cancel } = sendToInbox(link, next.file, sender, (progress) => update({ progress }));
        cancelRef.current = cancel;
        promise
            .then((saved) => update({ state: "done", message: saved.name !== next.file.name ? `Saved as ${saved.name}` : undefined }))
            .catch((err: unknown) => update({ state: "failed", message: err instanceof Error ? err.message : "Upload failed." }))
            .finally(() => {
                cancelRef.current = null;
                busyRef.current = false;
                // Limits and the received list change after each file
                void reload();
            });
    }, [queue, link, sender, reload]);

    const expired = inbox?.expiresAt ? new Date(inbox.expiresAt).getTime() <= now : false;
    const closedText = inbox && inbox.status !== "open" ? CLOSED_TEXT[inbox.status] : null;
    const nameMissing = inbox?.requireName === true && sender.trim() === "";
    const sending = queue.some((q) => q.state === "waiting" || q.state === "sending");

    function addFiles(files: FileList | null) {
        if (!inbox || !files?.length || nameMissing) return;
        const items = Array.from(files).map<QueueItem>((file) => {
            const problem = precheck(file, inbox);
            return { key: ++keyRef.current, file, state: problem ? "failed" : "waiting", progress: 0, message: problem ?? undefined };
        });
        setQueue((list) => [...list, ...items]);
        if (inputRef.current) inputRef.current.value = "";
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-200">
            <div className="w-full max-w-lg rounded-xl border border-white/10 bg-slate-900/70 p-6 shadow-xl">
                {!inbox && !error && (
                    <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Loading…</span>
                    </div>
                )}

                {(error || expired) && (
                    <div className="flex flex-col items-center gap-3 py-10 text-center text-slate-400">
                        <Link2Off className="h-10 w-10 text-slate-600" />
                        <p className="text-sm">{error ?? "This upload link has expired"}</p>
                    </div>
                )}

                {inbox && !error && !expired && (
                    <div className="space-y-5">
                        <div className="flex items-start gap-3">
                            <Inbox className="mt-0.5 h-8 w-8 shrink-0 text-sky-400" />
                            <div className="min-w-0">
                                <h1 className="break-words text-lg font-semibold text-slate-100">{inbox.title}</h1>
                                {inbox.description && <p className="whitespace-pre-line break-words text-sm text-slate-400">{inbox.description}</p>}
                            </div>
                        </div>

                        {inbox.locked ? (
                            <PasswordForm link={link} onUnlocked={setInbox} />
                        ) : (
                            <>
                                {closedText ? (
                                    <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-300">{closedText}</p>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="inbox-sender">Your name{inbox.requireName ? "" : " (optional)"}</Label>
                                            <Input
                                                id="inbox-sender"
                                                value={sender}
                                                maxLength={60}
                                                disabled={sending}
                                                onChange={(e) => setSender(e.target.value)}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            disabled={nameMissing}
                                            onClick={() => inputRef.current?.click()}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragging(true);
                                            }}
                                            onDragLeave={() => setDragging(false)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setDragging(false);
                                                addFiles(e.dataTransfer.files);
                                            }}
                                            className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                                dragging ? "border-rose-500 bg-rose-500/10" : "border-white/15 hover:bg-white/5"
                                            }`}
                                        >
                                            <UploadCloud className="h-8 w-8 text-slate-400" />
                                            <span className="text-sm text-slate-300">
                                                {nameMissing ? "Enter your name first" : "Drop files here, or click to choose"}
                                            </span>
                                        </button>
                                        <input
                                            ref={inputRef}
                                            type="file"
                                            multiple
                                            accept={inbox.allowedExt?.map((e) => "." + e).join(",")}
                                            className="hidden"
                                            onChange={(e) => addFiles(e.target.files)}
                                        />

                                        <ul className="space-y-1 text-xs text-slate-500">
                                            {inbox.allowedExt && <li>Accepted: {inbox.allowedExt.map((e) => "." + e).join(", ")}</li>}
                                            {inbox.maxFileBytes && <li>Up to {formatSize(inbox.maxFileBytes, true)} per file</li>}
                                            {inbox.bytesLeft && <li>{formatSize(inbox.bytesLeft, true)} of space left</li>}
                                            {inbox.filesLeft !== null && inbox.filesLeft !== undefined && (
                                                <li>{inbox.filesLeft} more file{inbox.filesLeft === 1 ? "" : "s"}</li>
                                            )}
                                        </ul>
                                    </>
                                )}

                                {queue.length > 0 && (
                                    <ul className="space-y-2">
                                        {queue.map((item) => (
                                            <QueueRow key={item.key} item={item} onCancel={() => cancelRef.current?.()} />
                                        ))}
                                    </ul>
                                )}

                                {inbox.received && inbox.received.length > 0 && (
                                    <section className="space-y-1">
                                        <p className="text-sm font-semibold text-slate-200">Already received</p>
                                        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-400">
                                            {inbox.received.map((f, i) => (
                                                <li key={i} className="flex justify-between gap-2">
                                                    <span className="truncate" title={f.name}>{f.name}</span>
                                                    <span className="shrink-0">{formatSize(f.size, true)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}
                            </>
                        )}

                        {inbox.expiresAt && (
                            <p className="flex items-center gap-2 text-xs text-slate-500" title={formatDate(inbox.expiresAt)}>
                                <Clock className="h-3.5 w-3.5" />
                                Closes {formatTimeLeft(inbox.expiresAt, now)}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
