"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pause, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatSize } from "@/lib/file-manager/format";
import { DropRequestSettings, DropSettings, fetchDropSettings, saveDropSettings } from "@/lib/api/user/drop.service";
import { adminCloseDropRequest } from "@/lib/api/user/drop-request.service";

type Role = DropRequestSettings["roles"][number];
const ROLES: Role[] = ["ADMIN", "USER", "GUEST"];

type Form = {
    folder: string;
    defaultHours: string;
    maxHours: string;
    quotaGB: string;
    requests: DropRequestSettings;
};

function toForm(settings: DropSettings): Form {
    return {
        folder: settings.folder.folder ?? "",
        defaultHours: String(settings.limits.defaultHours),
        maxHours: String(settings.limits.maxHours),
        quotaGB: String(Math.round((settings.limits.quotaMB / 1024) * 100) / 100),
        requests: { ...settings.requests.settings, roles: [...settings.requests.settings.roles] },
    };
}

// ADMIN only: where drops are kept and how long and how big they may be
export function DropLimitsSettings() {
    const [settings, setSettings] = useState<DropSettings | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchDropSettings()
            .then((data) => {
                if (cancelled) return;
                setSettings(data);
                setForm(toForm(data));
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the drop settings.");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Follow a folder move until every drop has arrived (the form keeps what the admin typed)
    const moving = settings !== null && (settings.migration.running || settings.migration.pending > 0);
    useEffect(() => {
        if (!moving) return;
        const timer = setInterval(() => {
            fetchDropSettings().then(setSettings).catch(() => undefined);
        }, 2000);
        return () => clearInterval(timer);
    }, [moving]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form) return;
        setError(null);

        const values = {
            folder: form.folder.trim() || null,
            defaultHours: Number(form.defaultHours),
            maxHours: Number(form.maxHours),
            quotaMB: Math.round(Number(form.quotaGB) * 1024),
            requests: form.requests,
        };
        if (!Number.isFinite(values.quotaMB) || values.quotaMB < 0) return setError("Quota must be a number of GB (0 = no limit).");

        setSaving(true);
        try {
            const saved = await saveDropSettings(values);
            const moved = (saved.folder.folder ?? null) !== (settings?.folder.folder ?? null);
            setSettings(saved);
            setForm(toForm(saved));
            toast.success(moved ? "Saved. Drops are being moved to the new folder." : "Drop settings saved");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleRequest(id: string, closed: boolean) {
        try {
            await adminCloseDropRequest(id, closed);
            setSettings(await fetchDropSettings());
            toast.success(closed ? "Request link paused" : "Request link reopened");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not change the link.");
        }
    }

    if (!settings || !form) {
        return error ? <p className="text-xs text-red-400">{error}</p> : <p className="text-xs text-slate-500">Loading...</p>;
    }

    const set = (field: Exclude<keyof Form, "requests">) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: e.target.value });
    const setRequests = (patch: Partial<DropRequestSettings>) => setForm({ ...form, requests: { ...form.requests, ...patch } });
    const toggleRole = (role: Role, on: boolean) =>
        setRequests({ roles: on ? ROLES.filter((r) => r === role || form.requests.roles.includes(r)) : form.requests.roles.filter((r) => r !== role) });

    return (
        <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-md border border-white/10 p-2">
                    <p className="text-slate-500">Live drops</p>
                    <p className="text-sm font-semibold text-slate-100">{settings.usage.drops}</p>
                </div>
                <div className="rounded-md border border-white/10 p-2">
                    <p className="text-slate-500">Space used</p>
                    <p className="text-sm font-semibold text-slate-100">{formatSize(settings.usage.bytes)}</p>
                </div>
                <div className="col-span-2 rounded-md border border-white/10 p-2 sm:col-span-1">
                    <p className="text-slate-500">Stored in</p>
                    <p className="truncate font-mono text-sm text-slate-100" title={settings.folder.current}>{settings.folder.current}</p>
                </div>
            </div>

            {moving && (
                <p className="flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-2 text-xs text-sky-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Moving drops to the new folder: {settings.migration.pending} left. Their links keep working.
                </p>
            )}
            {settings.migration.lastError && (
                <p className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
                    Some drops could not be moved yet and will be retried: {settings.migration.lastError}
                </p>
            )}

            <div className="space-y-2">
                <Label htmlFor="drop-folder">Drop folder</Label>
                <Input
                    id="drop-folder"
                    placeholder={`Default: ${settings.folder.default}`}
                    value={form.folder}
                    onChange={set("folder")}
                    className="font-mono text-sm"
                />
                <p className="text-[11px] text-slate-500">
                    Empty = the default. The folder must be empty or not exist yet. Changing it moves every current drop there,
                    and nobody can open it from the file manager.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                    <Label htmlFor="drop-default-hours">Default lifetime (hours)</Label>
                    <Input id="drop-default-hours" type="number" min={1} step={1} value={form.defaultHours} onChange={set("defaultHours")} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="drop-max-hours">Longest lifetime (hours)</Label>
                    <Input id="drop-max-hours" type="number" min={1} step={1} value={form.maxHours} onChange={set("maxHours")} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="drop-quota">Quota per user (GB)</Label>
                    <Input id="drop-quota" type="number" min={0} step="any" value={form.quotaGB} onChange={set("quotaGB")} />
                    <p className="text-[11px] text-slate-500">0 = no limit</p>
                </div>
            </div>

            <fieldset className="space-y-3 rounded-lg border border-white/10 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-200">Request links</legend>
                <p className="text-[11px] text-slate-500">
                    Links that let people without an account send files to a user. Received files are that user&apos;s drops:
                    they use the quota and lifetimes above.
                </p>
                <label htmlFor="requests-enabled" className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                    <input
                        id="requests-enabled"
                        type="checkbox"
                        className="h-4 w-4 accent-rose-500"
                        checked={form.requests.enabled}
                        onChange={(e) => setRequests({ enabled: e.target.checked })}
                    />
                    Allow request links
                </label>
                <div className="space-y-1">
                    <p className="text-xs text-slate-400">Who may create them</p>
                    <div className="flex flex-wrap gap-4">
                        {ROLES.map((role) => (
                            <label key={role} htmlFor={`requests-role-${role}`} className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                                <input
                                    id={`requests-role-${role}`}
                                    type="checkbox"
                                    className="h-4 w-4 accent-rose-500"
                                    disabled={!form.requests.enabled}
                                    checked={form.requests.roles.includes(role)}
                                    onChange={(e) => toggleRole(role, e.target.checked)}
                                />
                                {role}
                            </label>
                        ))}
                    </div>
                </div>
                <label htmlFor="requests-no-expiry" className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                    <input
                        id="requests-no-expiry"
                        type="checkbox"
                        className="h-4 w-4 accent-rose-500"
                        disabled={!form.requests.enabled}
                        checked={form.requests.allowNoExpiry}
                        onChange={(e) => setRequests({ allowNoExpiry: e.target.checked })}
                    />
                    Allow links that take files until their owner closes them
                </label>
            </fieldset>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end">
                <Button type="submit" disabled={saving} className="gap-1">
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save"}
                </Button>
            </div>

            <section className="space-y-2">
                <p className="text-sm font-semibold text-slate-200">All request links</p>
                {settings.requests.list.length === 0 ? (
                    <p className="text-xs text-slate-500">Nobody has made a request link yet.</p>
                ) : (
                    <ul className="space-y-1">
                        {settings.requests.list.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 px-2 py-1.5 text-xs">
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-100">
                                        <span className="break-all">{r.title}</span>
                                        <Badge variant="outline" className="border-white/15 text-slate-400">{r.status}</Badge>
                                    </p>
                                    <p className="text-slate-500">
                                        {r.owner} · {r.fileCount} file{r.fileCount === 1 ? "" : "s"}, {formatSize(r.usedBytes, true)}
                                        {r.expiresAt ? ` · closes ${formatDate(r.expiresAt)}` : ""}
                                    </p>
                                </div>
                                {r.status !== "expired" && (
                                    <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => void toggleRequest(r.id, r.closedAt === null)}>
                                        {r.closedAt ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                        {r.closedAt ? "Reopen" : "Pause"}
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </form>
    );
}
