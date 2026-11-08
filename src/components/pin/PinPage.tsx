"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import {
    CheckCircle2,
    Clock,
    Copy,
    DoorOpen,
    Download,
    Eye,
    EyeOff,
    FileIcon,
    KeyRound,
    Loader2,
    Lock,
    LockOpen,
    QrCode,
    StickyNote,
    Trash2,
    UploadCloud,
    X,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { MediaPreview } from "@/components/file-manager/MediaPreview";
import { formatDate, formatSize, formatTimeLeft } from "@/lib/file-manager/format";
import {
    PinItem,
    PinLimits,
    PinRoom,
    addPinNote,
    closePinRoom,
    createPinRoom,
    deletePinItem,
    fetchPinRoom,
    fetchPinStatus,
    joinPinRoom,
    leavePinRoom,
    lockPinRoom,
    pinItemUrl,
    uploadToPinRoom,
} from "@/lib/api/user/pin.service";

const POLL_MS = 3000;
const PIN_INPUT_RE = /^\d{0,8}$/;

type QueueItem = {
    key: number;
    file: File;
    state: "waiting" | "sending" | "done" | "failed";
    progress: number;
    message?: string;
};

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

// --- small pieces ---

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
    return (
        <main className="flex min-h-screen items-start justify-center bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-200 sm:items-center">
            <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border border-white/10 bg-slate-900/70 p-6 shadow-xl`}>{children}</div>
        </main>
    );
}

function Centered({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-slate-400">
            {icon}
            <p className="text-sm">{text}</p>
        </div>
    );
}

// QR code drawn as one SVG path, black on white so every phone camera reads it
function PinQr({ url }: { url: string }) {
    const { size, d } = useMemo(() => {
        const qr = qrcode(0, "M");
        qr.addData(url);
        qr.make();
        const count = qr.getModuleCount();
        let path = "";
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (qr.isDark(row, col)) path += `M${col + 2} ${row + 2}h1v1h-1z`;
            }
        }
        return { size: count + 4, d: path };
    }, [url]);

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44 rounded-md" role="img" aria-label={`QR code for ${url}`} shapeRendering="crispEdges">
            <rect width={size} height={size} fill="#fff" />
            <path d={d} fill="#000" />
        </svg>
    );
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

// Plain text, with http(s) links made clickable. Nothing typed is ever rendered as HTML.
function NoteText({ text }: { text: string }) {
    const parts = text.split(URL_RE);
    return (
        <p className="whitespace-pre-wrap break-words text-sm text-slate-100">
            {parts.map((part, i) => {
                if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
                // Trailing punctuation is usually the sentence, not the link
                const url = part.replace(/[.,;:!?)\]]+$/, "");
                return (
                    <Fragment key={i}>
                        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
                            {url}
                        </a>
                        {part.slice(url.length)}
                    </Fragment>
                );
            })}
        </p>
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
            {item.message && <p className={`text-xs ${item.state === "failed" ? "text-red-400" : "text-slate-400"}`}>{item.message}</p>}
        </li>
    );
}

function ItemRow({ item, onDelete }: { item: PinItem; onDelete: (item: PinItem) => void }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    async function copy() {
        if (item.text && (await copyText(item.text))) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    }

    return (
        <li className="space-y-2 rounded-md border border-white/10 p-3">
            <div className="flex items-start gap-2">
                {item.kind === "note" ? (
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                ) : (
                    <FileIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                )}
                <div className="min-w-0 flex-1">
                    {item.kind === "note" && item.text !== null ? (
                        <NoteText text={item.text} />
                    ) : (
                        <p className="truncate text-sm text-slate-100" title={item.name ?? undefined}>{item.name}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500" title={formatDate(item.createdAt)}>
                        {item.kind === "file" ? `${formatSize(item.size, true)} · ` : ""}
                        {new Date(item.createdAt).toLocaleTimeString()}
                    </p>
                </div>
                <div className="flex shrink-0 items-center">
                    {item.kind === "note" && (
                        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" aria-label="Copy note" onClick={copy}>
                            {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    )}
                    {item.kind === "file" && item.preview && (
                        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" aria-label={open ? `Hide ${item.name}` : `Preview ${item.name}`} onClick={() => setOpen(!open)}>
                            {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                    )}
                    {item.kind === "file" && (
                        <Button asChild size="sm" variant="ghost" className="h-8 px-2" aria-label={`Download ${item.name}`}>
                            <a href={pinItemUrl(item.id)} download>
                                <Download className="h-4 w-4" />
                            </a>
                        </Button>
                    )}
                    {item.canDelete && (
                        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-slate-400 hover:text-red-400" aria-label="Delete" onClick={() => onDelete(item)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
            {open && item.preview && item.name && <MediaPreview key={item.id} src={pinItemUrl(item.id, true)} name={item.name} kind={item.preview} />}
        </li>
    );
}

// --- join or create ---

function JoinForm({ limits, initialPin, notice, onEntered }: { limits: PinLimits; initialPin: string; notice: string | null; onEntered: (room: PinRoom) => void }) {
    const [pin, setPin] = useState(initialPin);
    const [error, setError] = useState<string | null>(notice);
    const [busy, setBusy] = useState<"join" | "create" | null>(null);

    async function join(e?: React.FormEvent) {
        e?.preventDefault();
        if (pin.length < 4) return setError("A PIN has at least 4 digits.");
        setBusy("join");
        setError(null);
        try {
            onEntered(await joinPinRoom(pin));
        } catch (err: unknown) {
            setError(errorText(err, "Could not join."));
        } finally {
            setBusy(null);
        }
    }

    async function create() {
        setBusy("create");
        setError(null);
        try {
            onEntered(await createPinRoom());
        } catch (err: unknown) {
            setError(errorText(err, "Could not make a room."));
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-8 w-8 shrink-0 text-sky-400" />
                <div>
                    <h1 className="text-lg font-semibold text-slate-100">PIN room</h1>
                    <p className="text-sm text-slate-400">Move files and notes between devices. Type a room&apos;s PIN to join it, or make a new room.</p>
                </div>
            </div>

            <form onSubmit={join} className="space-y-3">
                <Input
                    autoFocus
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label="PIN"
                    placeholder="PIN"
                    value={pin}
                    maxLength={8}
                    onChange={(e) => PIN_INPUT_RE.test(e.target.value) && setPin(e.target.value)}
                    className="h-14 text-center font-mono text-3xl tracking-[0.4em]"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy !== null || pin.length < 4}>
                    {busy === "join" ? "Joining..." : "Join room"}
                </Button>
            </form>

            <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="h-px flex-1 bg-white/10" />
                or
                <span className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-2">
                <Button type="button" variant="secondary" className="w-full" disabled={busy !== null} onClick={create}>
                    {busy === "create" ? "Making a room..." : "Make a new room"}
                </Button>
                <p className="text-center text-[11px] text-slate-500">
                    A room lasts {limits.roomMinutes >= 60 && limits.roomMinutes % 60 === 0 ? `${limits.roomMinutes / 60} hour${limits.roomMinutes === 60 ? "" : "s"}` : `${limits.roomMinutes} minutes`}
                    {" "}and holds up to {formatSize(limits.roomBytes, true)}. Everything in it is deleted when it ends.
                </p>
            </div>
        </div>
    );
}

// --- inside a room ---

function RoomView({ room, now, onRoom, onGone }: { room: PinRoom; now: number; onRoom: (room: PinRoom) => void; onGone: (message: string | null) => void }) {
    const [note, setNote] = useState("");
    const [noteBusy, setNoteBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [dragging, setDragging] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const cancelRef = useRef<(() => void) | null>(null);
    const keyRef = useRef(0);
    const busyRef = useRef(false);

    const items = room.items ?? [];
    const joinUrl = typeof window === "undefined" ? `/p/${room.pin}` : `${window.location.origin}/p/${room.pin}`;
    const left = Math.max(0, Number(room.limits.roomBytes) - Number(room.usedBytes));

    const refresh = useCallback(async () => {
        const next = await fetchPinRoom();
        if (next) onRoom(next);
        else onGone("This room has closed.");
    }, [onRoom, onGone]);

    // Uploads the waiting files one at a time
    useEffect(() => {
        if (busyRef.current) return;
        const next = queue.find((q) => q.state === "waiting");
        if (!next) return;

        busyRef.current = true;
        const update = (patch: Partial<QueueItem>) => setQueue((list) => list.map((q) => (q.key === next.key ? { ...q, ...patch } : q)));
        update({ state: "sending", progress: 0 });

        const { promise, cancel } = uploadToPinRoom(next.file, (progress) => update({ progress }));
        cancelRef.current = cancel;
        promise
            .then(() => update({ state: "done" }))
            .catch((err: unknown) => update({ state: "failed", message: errorText(err, "Upload failed.") }))
            .finally(() => {
                cancelRef.current = null;
                busyRef.current = false;
                void refresh().catch(() => undefined);
            });
    }, [queue, refresh]);

    useEffect(() => () => cancelRef.current?.(), []);

    function addFiles(files: FileList | File[] | null) {
        if (!files || files.length === 0) return;
        const fileCap = Number(room.limits.fileBytes);
        const added = Array.from(files).map<QueueItem>((file) => {
            const problem = file.size > fileCap ? `Larger than ${formatSize(fileCap, true)}, the most a room takes per file.` : null;
            return { key: ++keyRef.current, file, state: problem ? "failed" : "waiting", progress: 0, message: problem ?? undefined };
        });
        // Finished rows go away once new files come in
        setQueue((list) => [...list.filter((q) => q.state !== "done"), ...added]);
        if (inputRef.current) inputRef.current.value = "";
    }

    async function sendNote() {
        const text = note.trim();
        if (!text) return;
        setNoteBusy(true);
        setError(null);
        try {
            onRoom(await addPinNote(text));
            setNote("");
        } catch (err: unknown) {
            setError(errorText(err, "Could not add the note."));
        } finally {
            setNoteBusy(false);
        }
    }

    async function run(action: () => Promise<void>, fallback: string) {
        setError(null);
        try {
            await action();
        } catch (err: unknown) {
            setError(errorText(err, fallback));
        }
    }

    const remove = (item: PinItem) => run(async () => {
        await deletePinItem(item.id);
        await refresh();
    }, "Could not delete it.");

    const toggleLock = () => run(async () => onRoom(await lockPinRoom(!room.locked)), "Could not change the lock.");

    const close = () => run(async () => {
        await closePinRoom();
        onGone(null);
    }, "Could not close the room.");

    const leave = () => run(async () => {
        await leavePinRoom();
        onGone(null);
    }, "Could not leave the room.");

    async function copyPin() {
        if (await copyText(joinUrl)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    }

    return (
        <div
            className="space-y-5"
            onPaste={(e) => {
                // Pasted files (e.g. a screenshot) go up like dropped ones
                const files = Array.from(e.clipboardData.files);
                if (files.length > 0) {
                    e.preventDefault();
                    addFiles(files);
                }
            }}
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Room PIN</p>
                    <p className="font-mono text-4xl font-semibold tracking-[0.25em] text-slate-50">{room.pin}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500" title={formatDate(room.expiresAt)}>
                        <Clock className="h-3.5 w-3.5" />
                        Deleted {formatTimeLeft(room.expiresAt, now)}
                        {room.locked && (
                            <span className="ml-2 inline-flex items-center gap-1 text-amber-300">
                                <Lock className="h-3 w-3" /> Locked
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={copyPin} aria-label="Copy room link">
                        {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowQr(!showQr)} aria-label={showQr ? "Hide QR code" : "Show QR code"}>
                        <QrCode className="h-4 w-4" />
                    </Button>
                    {room.isCreator && (
                        <Button type="button" size="sm" variant="ghost" onClick={toggleLock} aria-label={room.locked ? "Unlock room" : "Lock room"} title={room.locked ? "Let new devices join again" : "Stop new devices from joining"}>
                            {room.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={leave} aria-label="Leave room" title="Leave on this device; the room stays open">
                        <DoorOpen className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {showQr && (
                <div className="flex flex-col items-center gap-2">
                    <PinQr url={joinUrl} />
                    <p className="text-xs text-slate-500">Scan to join from a phone</p>
                </div>
            )}

            <div className="space-y-2">
                <Textarea
                    value={note}
                    maxLength={room.limits.noteChars}
                    placeholder="Write a note or paste a link…"
                    rows={3}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            void sendNote();
                        }
                    }}
                />
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500">Ctrl+Enter to add · paste a screenshot to upload it</p>
                    <Button type="button" size="sm" disabled={noteBusy || !note.trim()} onClick={sendNote}>
                        {noteBusy ? "Adding..." : "Add note"}
                    </Button>
                </div>
            </div>

            <button
                type="button"
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
                className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
                    dragging ? "border-rose-500 bg-rose-500/10" : "border-white/15 hover:bg-white/5"
                }`}
            >
                <UploadCloud className="h-7 w-7 text-slate-400" />
                <span className="text-sm text-slate-300">Drop files here, or click to choose</span>
                <span className="text-[11px] text-slate-500">
                    {formatSize(left, true)} left · up to {formatSize(room.limits.fileBytes, true)} per file · {room.itemCount}/{room.limits.maxItems} items
                </span>
            </button>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />

            {error && <p className="text-xs text-red-400">{error}</p>}

            {queue.length > 0 && (
                <ul className="space-y-2">
                    {queue.map((item) => (
                        <QueueRow key={item.key} item={item} onCancel={() => cancelRef.current?.()} />
                    ))}
                </ul>
            )}

            {items.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">Nothing here yet. Whatever anyone in the room adds shows up here.</p>
            ) : (
                <ul className="space-y-2">
                    {items.map((item) => (
                        <ItemRow key={item.id} item={item} onDelete={remove} />
                    ))}
                </ul>
            )}

            {room.isCreator && (
                <div className="flex justify-end border-t border-white/10 pt-4">
                    {confirmClose ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Delete everything in this room now?</span>
                            <Button type="button" size="sm" variant="destructive" onClick={close}>Close room</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmClose(false)}>Keep</Button>
                        </div>
                    ) : (
                        <Button type="button" size="sm" variant="ghost" className="text-slate-400 hover:text-red-400" onClick={() => setConfirmClose(true)}>
                            <Trash2 className="mr-1 h-4 w-4" /> Close room
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

// Public page behind /p and /p/<PIN>: no login. Anyone with a room's PIN can add
// files and notes to it and fetch everything in it, until the room expires.
export function PinPage({ initialPin = "" }: { initialPin?: string }) {
    const [state, setState] = useState<
        | { stage: "loading" }
        | { stage: "off" }
        | { stage: "error"; message: string }
        | { stage: "join"; limits: PinLimits; notice: string | null }
        | { stage: "room"; room: PinRoom }
    >({ stage: "loading" });
    const [now, setNow] = useState(() => Date.now());
    const limitsRef = useRef<PinLimits | null>(null);

    const showRoom = useCallback((room: PinRoom) => {
        limitsRef.current = room.limits;
        setState((prev) => {
            // A poll that found nothing new keeps the items already shown
            if (room.unchanged && prev.stage === "room") return { stage: "room", room: { ...prev.room, ...room, items: prev.room.items } };
            return { stage: "room", room };
        });
    }, []);

    const showJoin = useCallback((notice: string | null) => {
        const limits = limitsRef.current;
        if (limits) setState({ stage: "join", limits, notice });
        else setState({ stage: "off" });
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const status = await fetchPinStatus();
            if (cancelled) return;
            if (!status) return setState({ stage: "off" });
            limitsRef.current = status.limits;

            const room = await fetchPinRoom();
            if (cancelled) return;
            if (room && (!initialPin || room.pin === initialPin)) return showRoom(room);

            // A link or QR code with a PIN joins straight away
            if (initialPin) {
                try {
                    const joined = await joinPinRoom(initialPin);
                    if (!cancelled) showRoom(joined);
                } catch (err: unknown) {
                    if (!cancelled) setState({ stage: "join", limits: status.limits, notice: errorText(err, "Could not join.") });
                }
                return;
            }
            setState({ stage: "join", limits: status.limits, notice: null });
        })().catch((err: unknown) => {
            if (!cancelled) setState({ stage: "error", message: errorText(err, "Could not reach the server. Try again later.") });
        });
        return () => {
            cancelled = true;
        };
    }, [initialPin, showRoom]);

    // Keep the room fresh while it is open; skip work when nothing changed
    const version = state.stage === "room" ? state.room.version : null;
    useEffect(() => {
        if (version === null) return;
        const timer = setInterval(() => {
            if (document.hidden) return;
            fetchPinRoom(version)
                .then((room) => (room ? showRoom(room) : showJoin("This room has closed.")))
                .catch(() => undefined);
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [version, showRoom, showJoin]);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(timer);
    }, []);

    // The address bar follows the room, so a reload or a shared link lands in the same place
    useEffect(() => {
        const target = state.stage === "room" ? `/p/${state.room.pin}` : state.stage === "join" ? "/p" : null;
        if (target && window.location.pathname !== target) window.history.replaceState(null, "", target);
    }, [state]);

    if (state.stage === "loading") {
        return (
            <Shell>
                <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading…</span>
                </div>
            </Shell>
        );
    }
    if (state.stage === "off") {
        return (
            <Shell>
                <Centered icon={<KeyRound className="h-10 w-10 text-slate-600" />} text="PIN rooms are not available on this server." />
            </Shell>
        );
    }
    if (state.stage === "error") {
        return (
            <Shell>
                <Centered icon={<XCircle className="h-10 w-10 text-slate-600" />} text={state.message} />
            </Shell>
        );
    }
    if (state.stage === "join") {
        return (
            <Shell>
                <JoinForm limits={state.limits} initialPin={initialPin} notice={state.notice} onEntered={showRoom} />
            </Shell>
        );
    }
    return (
        <Shell wide>
            <RoomView room={state.room} now={now} onRoom={showRoom} onGone={showJoin} />
        </Shell>
    );
}
