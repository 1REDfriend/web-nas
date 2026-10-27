"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Clock, ExternalLink, Folder, Lock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
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
import {
    InboxInfo,
    InboxInput,
    InboxList,
    InboxReceipt,
    createInboxRequest,
    deleteInboxRequest,
    fetchInboxReceipts,
    fetchInboxes,
    updateInboxRequest,
} from "@/lib/api/user/inbox.service";

const MB = 1024 * 1024;
const EXPIRY_CHOICES = ["1", "7", "30", "90", "365"];
const KEEP = "keep";
const NEVER = "never";

const STATUS_LABEL: Record<InboxInfo["status"], string> = { open: "Open", closed: "Paused", full: "Full", expired: "Expired" };
const STATUS_STYLE: Record<InboxInfo["status"], string> = {
    open: "border-emerald-500/40 text-emerald-400",
    closed: "border-amber-500/40 text-amber-300",
    full: "border-sky-500/40 text-sky-300",
    expired: "border-white/15 text-slate-500",
};

type Form = {
    title: string;
    description: string;
    targetPath: string;
    slug: string;
    expiry: string;          // days, NEVER, or KEEP when editing
    maxFileMB: string;       // "" = no limit
    maxTotalGB: string;
    maxFiles: string;
    allowedExt: string;
    password: string;        // "" = keep (edit) / none (create)
    removePassword: boolean;
    requireName: boolean;
    splitBySender: boolean;
    showReceived: boolean;
};

const mbText = (bytes: string | null, per: number) => (bytes === null ? "" : String(Math.round((Number(bytes) / per) * 100) / 100));

function newForm(list: InboxList, targetPath: string): Form {
    return {
        title: "",
        description: "",
        targetPath,
        slug: "",
        expiry: String(list.defaults.expiresInDays),
        maxFileMB: String(list.defaults.maxFileMB),
        maxTotalGB: String(list.defaults.maxTotalMB / 1024),
        maxFiles: "",
        allowedExt: "",
        password: "",
        removePassword: false,
        requireName: false,
        splitBySender: false,
        showReceived: false,
    };
}

function editForm(inbox: InboxInfo): Form {
    return {
        title: inbox.title,
        description: inbox.description ?? "",
        targetPath: inbox.targetPath,
        slug: inbox.slug ?? "",
        expiry: KEEP,
        maxFileMB: mbText(inbox.maxFileBytes, MB),
        maxTotalGB: mbText(inbox.maxTotalBytes, 1024 * MB),
        maxFiles: inbox.maxFiles === null ? "" : String(inbox.maxFiles),
        allowedExt: inbox.allowedExt ?? "",
        password: "",
        removePassword: false,
        requireName: inbox.requireName,
        splitBySender: inbox.splitBySender,
        showReceived: inbox.showReceived,
    };
}

function optionalNumber(value: string, label: string, scale = 1): number | null {
    if (value.trim() === "") return null;
    const n = Math.round(Number(value) * scale);
    if (!Number.isFinite(n) || n < 1) throw new Error(`${label} must be a positive number, or empty for no limit.`);
    return n;
}

function toInput(form: Form, editing: boolean): InboxInput {
    const input: InboxInput = {
        title: form.title,
        description: form.description || null,
        targetPath: form.targetPath,
        slug: form.slug.trim() || null,
        maxFileMB: optionalNumber(form.maxFileMB, "Largest file"),
        maxTotalMB: optionalNumber(form.maxTotalGB, "Total size", 1024),
        maxFiles: optionalNumber(form.maxFiles, "Number of files"),
        allowedExt: form.allowedExt.trim() || null,
        requireName: form.requireName,
        splitBySender: form.splitBySender,
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

function InboxForm({
    list,
    editing,
    initial,
    onSaved,
    onCancel,
}: {
    list: InboxList;
    editing: InboxInfo | null;
    initial: Form;
    onSaved: (inbox: InboxInfo) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState<Form>(initial);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const set = (field: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [field]: e.target.value });

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        let input: InboxInput;
        try {
            input = toInput(form, editing !== null);
        } catch (err: unknown) {
            return setError(err instanceof Error ? err.message : "Check the form.");
        }
        setSaving(true);
        try {
            onSaved(editing ? await updateInboxRequest(editing.id, input) : await createInboxRequest(input));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    const id = (name: string) => `inbox-${name}`;

    return (
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-white/5 bg-slate-900/30 p-3">
            <p className="text-sm font-semibold text-slate-200">{editing ? `Edit "${editing.title}"` : "New upload link"}</p>

            <div className="space-y-2">
                <Label htmlFor={id("title")}>Title</Label>
                <Input id={id("title")} value={form.title} onChange={set("title")} maxLength={100} placeholder="Homework for chapter 3" required />
            </div>
            <div className="space-y-2">
                <Label htmlFor={id("description")}>Note for people sending files (optional)</Label>
                <Textarea id={id("description")} value={form.description} onChange={set("description")} maxLength={1000} rows={2} />
            </div>
            <div className="space-y-2">
                <Label htmlFor={id("target")}>Save files in</Label>
                <Input id={id("target")} value={form.targetPath} onChange={set("targetPath")} placeholder="/your-folder/Inbox" className="font-mono text-sm" required />
                <p className="text-[11px] text-slate-500">A folder you can upload to. It is created on the first file if it does not exist.</p>
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
                    <Label htmlFor={id("expiry")}>Open for</Label>
                    <Select value={form.expiry} onValueChange={(expiry) => setForm({ ...form, expiry })}>
                        <SelectTrigger id={id("expiry")} className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {editing && (
                                <SelectItem value={KEEP}>
                                    {editing.expiresAt ? `Keep (until ${formatDate(editing.expiresAt)})` : "Keep (never closes)"}
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
                    id={id("split")}
                    label="Put each sender's files in a folder with their name"
                    hint="Senders who leave the name empty go straight into the folder."
                    checked={form.splitBySender}
                    onChange={(v) => setForm({ ...form, splitBySender: v })}
                />
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

function Receipts({ inbox }: { inbox: InboxInfo }) {
    const [uploads, setUploads] = useState<InboxReceipt[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchInboxReceipts(inbox.id)
            .then((data) => !cancelled && setUploads(data.uploads))
            .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the files."));
        return () => {
            cancelled = true;
        };
    }, [inbox.id, inbox.fileCount]);

    if (error) return <p className="text-xs text-red-400">{error}</p>;
    if (!uploads) return <p className="text-xs text-slate-500">Loading...</p>;
    if (uploads.length === 0) return <p className="text-xs text-slate-500">Nothing received yet.</p>;

    const folderOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";

    return (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
            {uploads.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded px-1 py-0.5 text-xs hover:bg-white/5">
                    <Link href={`/?path=${encodeURIComponent(folderOf(u.path))}`} className="min-w-0 truncate text-slate-200 hover:underline" title={u.path}>
                        {u.name}
                    </Link>
                    <span className="shrink-0 text-slate-500">
                        {formatSize(u.size, true)}
                        {u.senderName ? ` · ${u.senderName}` : ""} · {formatDate(u.createdAt)}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function InboxCard({
    inbox,
    now,
    onEdit,
    onToggle,
    onDelete,
}: {
    inbox: InboxInfo;
    now: number;
    onEdit: () => void;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const usage = inbox.maxTotalBytes === null
        ? `${formatSize(inbox.usedBytes, true)} received`
        : `${formatSize(inbox.usedBytes, true)} of ${formatSize(inbox.maxTotalBytes, true)}`;

    return (
        <li className="space-y-2 rounded-lg border border-white/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2 break-all font-medium text-slate-100">
                        {inbox.title}
                        <Badge variant="outline" className={STATUS_STYLE[inbox.status]}>{STATUS_LABEL[inbox.status]}</Badge>
                        {inbox.hasPassword && <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="Has a password" />}
                    </p>
                    <p className="break-all font-mono text-xs text-slate-500">{inbox.url}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <CopyButton text={inbox.url} label="Copy link" />
                    <Button asChild size="sm" variant="ghost" aria-label="Open the link's page">
                        <a href={inbox.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Edit" onClick={onEdit}>
                        <Pencil className="h-4 w-4" />
                    </Button>
                    {inbox.status !== "expired" && (
                        <Button size="sm" variant="ghost" aria-label={inbox.closedAt ? "Reopen" : "Pause"} title={inbox.closedAt ? "Reopen" : "Pause"} onClick={onToggle}>
                            {inbox.closedAt ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" aria-label="Delete" onClick={onDelete}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1 font-mono">
                    <Folder className="h-3.5 w-3.5" />
                    {inbox.targetPath}
                </span>
                {inbox.expiresAt && (
                    <span className="flex items-center gap-1" title={formatDate(inbox.expiresAt)}>
                        <Clock className="h-3.5 w-3.5" />
                        {inbox.status === "expired" ? "Expired" : `Closes ${formatTimeLeft(inbox.expiresAt, now)}`}
                    </span>
                )}
                <span>{usage}</span>
                <span>
                    {inbox.fileCount} file{inbox.fileCount === 1 ? "" : "s"}
                    {inbox.maxFiles !== null ? ` of ${inbox.maxFiles}` : ""}
                </span>
            </div>
            <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-sky-400 hover:underline">
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Received files
            </button>
            {open && <Receipts inbox={inbox} />}
        </li>
    );
}

export function InboxesSettings({ initialPath }: { initialPath?: string }) {
    const [list, setList] = useState<InboxList | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    // null = no form, "new" = create, otherwise the link being edited
    const [formFor, setFormFor] = useState<"new" | InboxInfo | null>(initialPath ? "new" : null);
    const [formKey, setFormKey] = useState(0);
    const [confirm, setConfirm] = useState<InboxInfo | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const load = useCallback(() => {
        return fetchInboxes()
            .then((data) => {
                setList(data);
                setNow(Date.now());
                setLoadError(null);
            })
            .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Could not load your upload links."));
    }, []);

    // Keep counts current while the page is open
    useEffect(() => {
        void load();
        const timer = setInterval(() => void load(), 30000);
        return () => clearInterval(timer);
    }, [load]);

    function openForm(target: "new" | InboxInfo) {
        setFormFor(target);
        setFormKey((k) => k + 1);
    }

    async function toggle(inbox: InboxInfo) {
        try {
            await updateInboxRequest(inbox.id, { closed: inbox.closedAt === null });
            toast.success(inbox.closedAt ? `"${inbox.title}" takes files again` : `"${inbox.title}" is paused`);
            await load();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not change the link.");
        }
    }

    async function handleConfirmDelete() {
        if (!confirm) return;
        setRemoving(true);
        try {
            await deleteInboxRequest(confirm.id);
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
                    {list.enabled ? "Your account cannot create upload links." : "Upload links are switched off by the admin."}
                </p>
            )}

            {list && list.canCreate && (formFor ? (
                <InboxForm
                    key={formKey}
                    list={list}
                    editing={formFor === "new" ? null : formFor}
                    initial={formFor === "new" ? newForm(list, initialPath ?? "") : editForm(formFor)}
                    onCancel={() => setFormFor(null)}
                    onSaved={() => {
                        toast.success(formFor === "new" ? "Upload link created" : "Saved");
                        setFormFor(null);
                        void load();
                    }}
                />
            ) : (
                <Button type="button" className="gap-1" onClick={() => openForm("new")}>
                    <Plus className="h-4 w-4" />
                    New upload link
                </Button>
            ))}

            {list && (
                <section className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-200">Your upload links</p>
                        <p className="text-[11px] text-slate-500">
                            {list.quota.limitBytes === null
                                ? `${formatSize(list.quota.usedBytes, true)} received in all`
                                : `${formatSize(list.quota.usedBytes, true)} of ${formatSize(list.quota.limitBytes, true)} received in all`}
                        </p>
                    </div>
                    {list.inboxes.length === 0 ? (
                        <p className="text-xs text-slate-500">No upload links yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {list.inboxes.map((inbox) => (
                                <InboxCard
                                    key={inbox.id}
                                    inbox={inbox}
                                    now={now}
                                    onEdit={() => openForm(inbox)}
                                    onToggle={() => void toggle(inbox)}
                                    onDelete={() => {
                                        setConfirm(inbox);
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
                        <AlertDialogTitle>Delete this upload link?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The link to &quot;{confirm?.title ?? ""}&quot; stops working right away. Files it already received stay in{" "}
                            <span className="font-mono">{confirm?.targetPath}</span>.
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
