"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
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
import { API_SCOPES, ApiScope } from "@/lib/security/api-key-format";
import {
    ApiKeyInfo,
    CreatedApiKey,
    createApiKeyRequest,
    fetchApiKeys,
    revokeAllApiKeysRequest,
    revokeApiKeyRequest,
} from "@/lib/api/user/api-key.service";

const SCOPE_HELP: Record<ApiScope, string> = {
    list: "See folders and file details",
    read: "Download files",
    upload: "Upload files and create folders",
    delete: "Move files to the trash",
};

const UPLOAD_LIMIT_OPTIONS = [
    { value: "none", label: "Server default" },
    { value: "10", label: "10 MB" },
    { value: "100", label: "100 MB" },
    { value: "1024", label: "1 GB" },
    { value: "10240", label: "10 GB" },
];

const EXPIRY_OPTIONS = [
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "365", label: "1 year" },
    { value: "never", label: "Never" },
];

function formatBytes(value: string | null) {
    if (value === null) return "Server default";
    const mb = Number(value) / (1024 * 1024);
    return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${+mb.toFixed(1)} MB`;
}

function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleString() : "—";
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0 gap-1"
            onClick={async () => {
                if (await copyText(text)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                } else {
                    toast.error("Copy failed. Select the text and copy it by hand.");
                }
            }}
        >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : label}
        </Button>
    );
}

function NewKeyPanel({ created, onDone }: { created: CreatedApiKey; onDone: () => void }) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const folder = created.key.rootPath ?? "/your-folder";
    const examples = [
        `curl -H "Authorization: Bearer ${created.secret}" ${origin}/api/v1/me`,
        `curl -T report.pdf -H "Authorization: Bearer ${created.secret}" "${origin}/api/v1/files/raw?path=${folder}/report.pdf"`,
    ];

    return (
        <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-sm font-semibold text-emerald-400">Key created: {created.key.name}</p>
            <p className="text-xs text-slate-300">
                Copy it now. This is the only time the full key is shown; if you lose it, revoke it and create a new one.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                    readOnly
                    value={created.secret}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                    aria-label="New API key"
                />
                <CopyButton text={created.secret} label="Copy key" />
            </div>
            <div className="space-y-2">
                <p className="text-xs text-slate-400">Try it:</p>
                {examples.map((example) => (
                    <div key={example} className="flex items-start gap-2">
                        <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-300">
                            {example}
                        </pre>
                        <CopyButton text={example} label="Copy" />
                    </div>
                ))}
            </div>
            <div className="flex justify-end">
                <Button type="button" onClick={onDone}>Done</Button>
            </div>
        </div>
    );
}

function CreateKeyForm({ onCreated }: { onCreated: (created: CreatedApiKey) => void }) {
    const [name, setName] = useState("");
    const [scopes, setScopes] = useState<ApiScope[]>(["list", "read", "upload"]);
    const [rootPath, setRootPath] = useState("");
    const [expiry, setExpiry] = useState("90");
    const [uploadLimit, setUploadLimit] = useState("none");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function toggleScope(scope: ApiScope) {
        setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!name.trim()) return setError("Give the key a name, e.g. the program that will use it.");
        if (scopes.length === 0) return setError("Pick at least one permission.");

        setSaving(true);
        try {
            const created = await createApiKeyRequest({
                name: name.trim(),
                scopes,
                rootPath: rootPath.trim() || null,
                expiresInDays: expiry === "never" ? null : Number(expiry),
                maxUploadMB: uploadLimit === "none" ? null : Number(uploadLimit),
            });
            setName("");
            setRootPath("");
            onCreated(created);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Could not create the key.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-white/5 bg-slate-900/30 p-3">
            <p className="text-sm font-semibold text-slate-200">New key</p>

            <div className="space-y-2">
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                    id="api-key-name"
                    placeholder="e.g. backup-server"
                    maxLength={64}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>

            <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Permissions</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {API_SCOPES.map((scope) => {
                        const on = scopes.includes(scope);
                        return (
                            <button
                                key={scope}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleScope(scope)}
                                className={`rounded-md border p-2 text-left transition-colors ${
                                    on ? "border-rose-500/60 bg-rose-500/10" : "border-white/10 hover:bg-white/5"
                                }`}
                            >
                                <span className="flex items-center gap-2 text-sm font-medium">
                                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-rose-500 bg-rose-500" : "border-slate-500"}`}>
                                        {on && <Check className="h-3 w-3 text-white" />}
                                    </span>
                                    {scope}
                                </span>
                                <span className="mt-1 block text-xs text-slate-400">{SCOPE_HELP[scope]}</span>
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="api-key-folder">Only this folder (optional)</Label>
                    <Input
                        id="api-key-folder"
                        placeholder="e.g. /alice/uploads"
                        value={rootPath}
                        onChange={(e) => setRootPath(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-500">Empty = every folder you can open.</p>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="api-key-upload-limit">Largest upload</Label>
                    <Select value={uploadLimit} onValueChange={setUploadLimit}>
                        <SelectTrigger id="api-key-upload-limit" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {UPLOAD_LIMIT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="api-key-expiry">Expires after</Label>
                    <Select value={expiry} onValueChange={setExpiry}>
                        <SelectTrigger id="api-key-expiry" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {EXPIRY_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end">
                <Button type="submit" disabled={saving} className="gap-1">
                    <Plus className="h-4 w-4" />
                    {saving ? "Creating..." : "Create key"}
                </Button>
            </div>
        </form>
    );
}

function KeyCard({ apiKey, onRevoke }: { apiKey: ApiKeyInfo; onRevoke: (key: ApiKeyInfo) => void }) {
    const active = apiKey.status === "active";
    return (
        <li className={`space-y-2 rounded-lg border border-white/10 p-3 ${active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-medium text-slate-100">{apiKey.name}</p>
                    <p className="font-mono text-xs text-slate-500">wnas_{apiKey.prefix}_…</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={active ? "secondary" : "outline"} className="capitalize">{apiKey.status}</Badge>
                    {active && (
                        <Button size="sm" variant="ghost" className="gap-1 text-red-400 hover:text-red-300" onClick={() => onRevoke(apiKey)}>
                            <Trash2 className="h-4 w-4" />
                            Revoke
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap gap-1">
                {apiKey.scopes.map((scope) => (
                    <Badge key={scope} variant="outline">{scope}</Badge>
                ))}
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <div className="flex gap-1"><dt className="text-slate-500">Folder:</dt><dd className="min-w-0 truncate font-mono">{apiKey.rootPath ?? "All your folders"}</dd></div>
                <div className="flex gap-1"><dt className="text-slate-500">Expires:</dt><dd>{apiKey.expiresAt ? formatDate(apiKey.expiresAt) : "Never"}</dd></div>
                <div className="flex gap-1"><dt className="text-slate-500">Last used:</dt><dd>{apiKey.lastUsedAt ? `${formatDate(apiKey.lastUsedAt)}${apiKey.lastUsedIp ? ` from ${apiKey.lastUsedIp}` : ""}` : "Never"}</dd></div>
                <div className="flex gap-1"><dt className="text-slate-500">Largest upload:</dt><dd>{formatBytes(apiKey.maxUploadBytes)}</dd></div>
                <div className="flex gap-1"><dt className="text-slate-500">Created:</dt><dd>{formatDate(apiKey.createdAt)}</dd></div>
            </dl>
        </li>
    );
}

export function ApiKeysDialog() {
    const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedApiKey | null>(null);
    // `confirm` keeps the last target so the text does not go blank while the dialog fades out
    const [confirm, setConfirm] = useState<ApiKeyInfo | "all" | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [revoking, setRevoking] = useState(false);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            setKeys(await fetchApiKeys());
        } catch (err: unknown) {
            setLoadError(err instanceof Error ? err.message : "Could not load your keys.");
        }
    }, []);

    async function handleConfirmRevoke() {
        if (!confirm) return;
        setRevoking(true);
        try {
            if (confirm === "all") {
                const count = await revokeAllApiKeysRequest();
                toast.success(`Revoked ${count} key${count === 1 ? "" : "s"}`);
            } else {
                await revokeApiKeyRequest(confirm.id);
                toast.success(`Revoked "${confirm.name}"`);
            }
            // Stop showing the full key of a key that no longer works
            if (confirm === "all" || confirm.id === created?.key.id) setCreated(null);
            setConfirmOpen(false);
            await load();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not revoke.");
        } finally {
            setRevoking(false);
        }
    }

    const activeCount = keys?.filter((k) => k.status === "active").length ?? 0;

    return (
        <Dialog
            onOpenChange={(open) => {
                if (open) void load();
                else setCreated(null);
            }}
        >
            <DialogTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-2">
                    <KeyRound className="w-4 h-4" />
                    <span>API Keys</span>
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-slate-950 border-white/10 text-slate-50 sm:max-w-[720px]">
                <div className="flex max-h-[80dvh] flex-col gap-4 overflow-y-auto pr-1">
                    <DialogHeader>
                        <DialogTitle className="text-rose-500">API Keys</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Let another program or server use your files through <span className="font-mono text-xs">/api/v1</span>.
                            A key can only do what you can, and only what you allow here.
                        </DialogDescription>
                    </DialogHeader>

                    {created ? (
                        <NewKeyPanel created={created} onDone={() => setCreated(null)} />
                    ) : (
                        <CreateKeyForm
                            onCreated={(result) => {
                                setCreated(result);
                                void load();
                            }}
                        />
                    )}

                    <section className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-200">Your keys</p>
                            {activeCount > 0 && (
                                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => {
                                    setConfirm("all");
                                    setConfirmOpen(true);
                                }}>
                                    Revoke all
                                </Button>
                            )}
                        </div>
                        {loadError && <p className="text-xs text-red-400">{loadError}</p>}
                        {keys === null && !loadError && <p className="text-xs text-slate-500">Loading...</p>}
                        {keys?.length === 0 && <p className="text-xs text-slate-500">No keys yet.</p>}
                        {keys && keys.length > 0 && (
                            <ul className="space-y-2">
                                {keys.map((key) => (
                                    <KeyCard
                                        key={key.id}
                                        apiKey={key}
                                        onRevoke={(target) => {
                                            setConfirm(target);
                                            setConfirmOpen(true);
                                        }}
                                    />
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </DialogContent>

            <AlertDialog open={confirmOpen} onOpenChange={(open) => !revoking && !open && setConfirmOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirm === "all" ? "Revoke all keys?" : "Revoke this key?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm === "all"
                                ? `All ${activeCount} active key${activeCount === 1 ? "" : "s"} stop working right away.`
                                : `"${confirm?.name ?? ""}" stops working right away.`}{" "}
                            Programs using {confirm === "all" ? "them" : "it"} will get an error. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={revoking}
                            onClick={(e) => {
                                e.preventDefault();
                                void handleConfirmRevoke();
                            }}
                        >
                            {revoking ? "Revoking..." : "Revoke"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}
