"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Clock, ExternalLink, Lock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { CopyButton } from "@/components/file-manager/CopyButton";
import { formatDate, formatSize, formatTimeLeft } from "@/lib/file-manager/format";
import { DropInfo, removeDropRequest } from "@/lib/api/user/drop.service";
import {
    DropRequestInfo,
    DropRequestInput,
    DropRequestList,
    createDropRequest,
    deleteDropRequest,
    fetchDropRequests,
    fetchReceivedDrops,
    updateDropRequest,
} from "@/lib/api/user/drop-request.service";

// The "Receive" side of Drops: links that let people send you files. Each file
// they send becomes one of your drops and is deleted when it expires.

const MB = 1024 * 1024;
const EXPIRY_CHOICES = ["1", "7", "30", "90", "365"];
const KEEP_CHOICES = [24, 72, 168, 336, 720, 2160];
const KEEP = "keep";
const NEVER = "never";

const STATUS_LABEL: Record<DropRequestInfo["status"], string> = { open: "Open", closed: "Paused", full: "Full", expired: "Ended" };
const STATUS_STYLE: Record<DropRequestInfo["status"], string> = {
    open: "border-emerald-500/40 text-emerald-400",
    closed: "border-amber-500/40 text-amber-300",
    full: "border-sky-500/40 text-sky-300",
    expired: "border-white/15 text-slate-500",
};

function hoursLabel(hours: number) {
    if (hours % 24 === 0) {
        const days = hours / 24;
        return `${days} day${days === 1 ? "" : "s"}`;
    }
    return `${hours} hour${hours === 1 ? "" : "s"}`;
}

// Common choices up to the admin's longest drop lifetime, plus that maximum and the current value
function keepOptions(maxHours: number, current: number) {
    const hours = new Set(KEEP_CHOICES.filter((h) => h <= maxHours));
    hours.add(maxHours);
    if (current <= maxHours) hours.add(current);
    return [...hours].sort((a, b) => a - b);
}

type Form = {
    title: string;
    description: string;
    slug: string;
    expiry: string;          // days, NEVER, or KEEP when editing
    keepHours: string;
    maxFileMB: string;       // "" = no limit
    maxTotalGB: string;
    maxFiles: string;
    allowedExt: string;
    password: string;        // "" = keep (edit) / none (create)
    removePassword: boolean;
    requireName: boolean;
    showReceived: boolean;
};

const mbText = (bytes: string | null, per: number) => (bytes === null ? "" : String(Math.round((Number(bytes) / per) * 100) / 100));

function newForm(list: DropRequestList): Form {
    return {
        title: "",
        description: "",
        slug: "",
        expiry: String(list.defaults.expiresInDays),
        keepHours: String(list.defaults.keepHours),
        maxFileMB: String(list.defaults.maxFileMB),
        maxTotalGB: String(list.defaults.maxTotalMB / 1024),
        maxFiles: "",
        allowedExt: "",
        password: "",
        removePassword: false,
        requireName: false,
        showReceived: false,
    };
}

function editForm(request: DropRequestInfo): Form {
    return {
        title: request.title,
        description: request.description ?? "",
        slug: request.slug ?? "",
        expiry: KEEP,
        keepHours: String(request.keepHours),
        maxFileMB: mbText(request.maxFileBytes, MB),
        maxTotalGB: mbText(request.maxTotalBytes, 1024 * MB),
        maxFiles: request.maxFiles === null ? "" : String(request.maxFiles),
        allowedExt: request.allowedExt ?? "",
        password: "",
        removePassword: false,
        requireName: request.requireName,
        showReceived: request.showReceived,
    };
}

function optionalNumber(value: string, label: string, scale = 1): number | null {
    if (value.trim() === "") return null;
    const n = Math.round(Number(value) * scale);
    if (!Number.isFinite(n) || n < 1) throw new Error(`${label} must be a positive number, or empty for no limit.`);
    return n;
}

function toInput(form: Form, editing: boolean): DropRequestInput {
    const input: DropRequestInput = {
        title: form.title,
        description: form.description || null,
        slug: form.slug.trim() || null,
        keepHours: Number(form.keepHours),
        maxFileMB: optionalNumber(form.maxFileMB, "Largest file"),
        maxTotalMB: optionalNumber(form.maxTotalGB, "Total size", 1024),
        maxFiles: optionalNumber(form.maxFiles, "Number of files"),
        allowedExt: form.allowedExt.trim() || null,
        requireName: form.requireName,
        showReceived: form.showReceived,
    };
    if (form.expiry !== KEEP) input.expiresInDays = form.expiry === NEVER ? null : Number(form.expiry);
    if (form.removePassword) input.password = null;
    else if (form.password) input.password = form.password;
    else if (!editing) input.password = null;
    return input;
}

function Check({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm text-slate-200">
            <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-rose-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span>
                {label}
                {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
            </span>
        </label>
    );
}

function RequestForm({
    list,
    editing,
    onSaved,
    onCancel,
}: {
    list: DropRequestList;
    editing: DropRequestInfo | null;
    onSaved: () => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState<Form>(() => (editing ? editForm(editing) : newForm(list)));
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const set = (field: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [field]: e.target.value });

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        let input: DropRequestInput;
        try {
            input = toInput(form, editing !== null);
        } catch (err: unknown) {
            return setError(err instanceof Error ? err.message : "Check the form.");
        }
        setSaving(true);
        try {
            if (editing) await updateDropRequest(editing.id, input);
            else await createDropRequest(input);
            onSaved();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    const id = (name: string) => `request-${name}`;

    return (
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-white/5 bg-slate-900/30 p-3">
            <p className="text-sm font-semibold text-slate-200">{editing ? `Edit "${editing.title}"` : "New request link"}</p>

            <div className="space-y-2">
                <Label htmlFor={id("title")}>Title</Label>
                <Input id={id("title")} value={form.title} onChange={set("title")} maxLength={100} placeholder="Homework for chapter 3" required />
            </div>
            <div className="space-y-2">
                <Label htmlFor={id("description")}>Note for people sending files (optional)</Label>
                <Textarea id={id("description")} value={form.description} onChange={set("description")} maxLength={1000} rows={2} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor={id("slug")}>Link name (optional)</Label>
                    <div className="flex items-center gap-1 text-sm">
                        <span className="shrink-0 text-slate-500">/u/</span>
                        <Input id={id("slug")} value={form.slug} onChange={set("slug")} maxLength={40} placeholder="random" className="font-mono" />
                    </div>
                    <p className="text-[11px] text-slate-500">a-z, 0-9 and -. Easy to guess, so add a password.</p>
                </div>
                <div className="space-y-2">
                    <Label htmlFor={id("expiry")}>Link takes files for</Label>
                    <Select value={form.expiry} onValueChange={(expiry) => setForm({ ...form, expiry })}>
                        <SelectTrigger id={id("expiry")} className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {editing && (
                                <SelectItem value={KEEP}>
                                    {editing.expiresAt ? `Keep (until ${formatDate(editing.expiresAt)})` : "Keep (no end date)"}
                                </SelectItem>
                            )}
                            {EXPIRY_CHOICES.map((d) => (
                                <SelectItem key={d} value={d}>{d === "1" ? "1 day" : `${d} days`}{editing ? " from now" : ""}</SelectItem>
                            ))}
                            {list.allowNoExpiry && <SelectItem value={NEVER}>Until I close it</SelectItem>}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor={id("keep")}>Keep each received file for</Label>
                <Select value={form.keepHours} onValueChange={(keepHours) => setForm({ ...form, keepHours })}>
                    <SelectTrigger id={id("keep")} className="w-full sm:w-64">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {keepOptions(list.maxKeepHours, Number(form.keepHours)).map((h) => (
                            <SelectItem key={h} value={String(h)}>{hoursLabel(h)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">
                    Received files are drops: they count against your drop quota and are deleted after this time.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                    <Label htmlFor={id("max-file")}>Largest file (MB)</Label>
                    <Input id={id("max-file")} type="number" min={1} step="any" value={form.maxFileMB} onChange={set("maxFileMB")} placeholder="No limit" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor={id("max-total")}>Total size (GB)</Label>
                    <Input id={id("max-total")} type="number" min={0.001} step="any" value={form.maxTotalGB} onChange={set("maxTotalGB")} placeholder="No limit" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor={id("max-files")}>Number of files</Label>
                    <Input id={id("max-files")} type="number" min={1} step={1} value={form.maxFiles} onChange={set("maxFiles")} placeholder="No limit" />
                </div>
            </div>
            <p className="-mt-2 text-[11px] text-slate-500">
                Empty = no limit. Files over 100 MB may not get through the internet connection to this server.
            </p>

            <div className="space-y-2">
                <Label htmlFor={id("ext")}>Accepted file types (optional)</Label>
                <Input id={id("ext")} value={form.allowedExt} onChange={set("allowedExt")} placeholder="pdf, docx, zip" />
                <p className="text-[11px] text-slate-500">Empty = any file.</p>
            </div>

            <div className="space-y-2">
                <Label htmlFor={id("password")}>Password (optional)</Label>
                <Input
                    id={id("password")}
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    disabled={form.removePassword}
                    onChange={set("password")}
                    placeholder={editing?.hasPassword ? "Leave empty to keep the current one" : "No password"}
                />
                {editing?.hasPassword && (
                    <Check id={id("remove-password")} label="Remove the password" checked={form.removePassword} onChange={(v) => setForm({ ...form, removePassword: v, password: "" })} />
                )}
            </div>

            <div className="space-y-2">
                <Check id={id("require-name")} label="Ask for the sender's name" checked={form.requireName} onChange={(v) => setForm({ ...form, requireName: v })} />
                <Check
                    id={id("show-received")}
                    label="Show the names of received files on the link's page"
                    hint="Everyone with the link sees them. Files can never be downloaded from there."
                    checked={form.showReceived}
                    onChange={(v) => setForm({ ...form, showReceived: v })}
                />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save" : "Create link"}</Button>
            </div>
        </form>
    );
}

// The drops a request received; each can be downloaded or removed like any drop
function Received({ request, now, onChanged }: { request: DropRequestInfo; now: number; onChanged: () => void }) {
    const [drops, setDrops] = useState<DropInfo[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchReceivedDrops(request.id)
            .then((data) => !cancelled && setDrops(data.received))
            .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the files."));
        return () => {
            cancelled = true;
        };
    }, [request.id, request.fileCount, version]);

    async function remove(drop: DropInfo) {
        try {
            await removeDropRequest(drop.id);
            toast.success(`"${drop.name}" was deleted`);
            setVersion((v) => v + 1);
            onChanged();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not delete the file.");
        }
    }

    if (error) return <p className="text-xs text-red-400">{error}</p>;
    if (!drops) return <p className="text-xs text-slate-500">Loading...</p>;

    const live = drops.filter((d) => new Date(d.expiresAt).getTime() > now);
    if (live.length === 0) return <p className="text-xs text-slate-500">Nothing to download right now.</p>;

    return (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
            {live.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded px-1 py-0.5 text-xs hover:bg-white/5">
                    <div className="min-w-0">
                        <p className="truncate text-slate-200" title={d.name}>{d.name}</p>
                        <p className="text-slate-500">
                            {formatSize(d.size, true)}
                            {d.senderName ? ` · from ${d.senderName}` : ""} · deleted {formatTimeLeft(d.expiresAt, now)}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2" aria-label={`Download ${d.name}`}>
                            <a href={d.downloadUrl}>Download</a>
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-300" aria-label={`Delete ${d.name}`} onClick={() => void remove(d)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function RequestCard({
    request,
    now,
    onEdit,
    onToggle,
    onDelete,
    onChanged,
}: {
    request: DropRequestInfo;
    now: number;
    onEdit: () => void;
    onToggle: () => void;
    onDelete: () => void;
    onChanged: () => void;
}) {
    const [open, setOpen] = useState(false);
    const usage = request.maxTotalBytes === null
        ? `${formatSize(request.usedBytes, true)} received`
        : `${formatSize(request.usedBytes, true)} of ${formatSize(request.maxTotalBytes, true)}`;

    return (
        <li className="space-y-2 rounded-lg border border-white/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2 break-all font-medium text-slate-100">
                        {request.title}
                        <Badge variant="outline" className={STATUS_STYLE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
                        {request.hasPassword && <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="Has a password" />}
                    </p>
                    <p className="break-all font-mono text-xs text-slate-500">{request.url}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <CopyButton text={request.url} label="Copy link" />
                    <Button asChild size="sm" variant="ghost" aria-label="Open the link's page">
                        <a href={request.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Edit" onClick={onEdit}>
                        <Pencil className="h-4 w-4" />
                    </Button>
                    {request.status !== "expired" && (
                        <Button size="sm" variant="ghost" aria-label={request.closedAt ? "Reopen" : "Pause"} title={request.closedAt ? "Reopen" : "Pause"} onClick={onToggle}>
                            {request.closedAt ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" aria-label="Delete" onClick={onDelete}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                {request.expiresAt && (
                    <span className="flex items-center gap-1" title={formatDate(request.expiresAt)}>
                        <Clock className="h-3.5 w-3.5" />
                        {request.status === "expired" ? "Ended" : `Closes ${formatTimeLeft(request.expiresAt, now)}`}
                    </span>
                )}
                <span>{usage}</span>
                <span>
                    {request.fileCount} file{request.fileCount === 1 ? "" : "s"}
                    {request.maxFiles !== null ? ` of ${request.maxFiles}` : ""}
                </span>
                <span>Files kept {hoursLabel(request.keepHours)}</span>
            </div>
            <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-sky-400 hover:underline">
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Received files
            </button>
            {open && <Received request={request} now={now} onChanged={onChanged} />}
        </li>
    );
}

export function DropRequests() {
    const [list, setList] = useState<DropRequestList | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    // null = no form, "new" = create, otherwise the request being edited
    const [formFor, setFormFor] = useState<"new" | DropRequestInfo | null>(null);
    const [formKey, setFormKey] = useState(0);
    const [confirm, setConfirm] = useState<DropRequestInfo | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    // State is only set once the request settles, so this is safe to start from an effect
    const load = useCallback(() => {
        return fetchDropRequests()
            .then((data) => {
                setList(data);
                setNow(Date.now());
                setLoadError(null);
            })
            .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Could not load your request links."));
    }, []);

    // Keep counts current while the page is open
    useEffect(() => {
        void load();
        const timer = setInterval(() => void load(), 30000);
        return () => clearInterval(timer);
    }, [load]);

    function openForm(target: "new" | DropRequestInfo) {
        setFormFor(target);
        setFormKey((k) => k + 1);
    }

    async function toggle(request: DropRequestInfo) {
        try {
            await updateDropRequest(request.id, { closed: request.closedAt === null });
            toast.success(request.closedAt ? `"${request.title}" takes files again` : `"${request.title}" is paused`);
            await load();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not change the link.");
        }
    }

    async function handleConfirmDelete() {
        if (!confirm) return;
        setRemoving(true);
        try {
            await deleteDropRequest(confirm.id);
            toast.success(`"${confirm.title}" was deleted`);
            if (formFor !== "new" && formFor?.id === confirm.id) setFormFor(null);
            setConfirmOpen(false);
            await load();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not delete the link.");
        } finally {
            setRemoving(false);
        }
    }

    return (
        <div className="space-y-6">
            {loadError && <p className="text-xs text-red-400">{loadError}</p>}
            {list === null && !loadError && <p className="text-xs text-slate-500">Loading...</p>}

            {list && !list.canCreate && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
                    {list.enabled ? "Your account cannot create request links." : "Request links are switched off by the admin."}
                </p>
            )}

            {list && list.canCreate && (formFor ? (
                <RequestForm
                    key={formKey}
                    list={list}
                    editing={formFor === "new" ? null : formFor}
                    onCancel={() => setFormFor(null)}
                    onSaved={() => {
                        toast.success(formFor === "new" ? "Request link created" : "Saved");
                        setFormFor(null);
                        void load();
                    }}
                />
            ) : (
                <div className="space-y-2 rounded-lg border border-white/5 bg-slate-900/30 p-3">
                    <p className="text-xs text-slate-400">
                        Make a link that lets people without an account send you files. What they send shows up here and under
                        Send as your drops, and is deleted after the time you pick.
                    </p>
                    <Button type="button" className="gap-1" onClick={() => openForm("new")}>
                        <Plus className="h-4 w-4" />
                        New request link
                    </Button>
                </div>
            ))}

            {list && (
                <section className="space-y-2">
                    <p className="text-sm font-semibold text-slate-200">Your request links</p>
                    {list.requests.length === 0 ? (
                        <p className="text-xs text-slate-500">No request links yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {list.requests.map((request) => (
                                <RequestCard
                                    key={request.id}
                                    request={request}
                                    now={now}
                                    onEdit={() => openForm(request)}
                                    onToggle={() => void toggle(request)}
                                    onChanged={() => void load()}
                                    onDelete={() => {
                                        setConfirm(request);
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
                        <AlertDialogTitle>Delete this request link?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The link &quot;{confirm?.title ?? ""}&quot; stops working right away. Files it already received stay in
                            your drops until they expire.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={removing}
                            onClick={(e) => {
                                e.preventDefault();
                                void handleConfirmDelete();
                            }}
                        >
                            {removing ? "Deleting..." : "Delete link"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
