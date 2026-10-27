"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatSize } from "@/lib/file-manager/format";
import { InboxAdminSettings as AdminData, adminCloseInbox, fetchInboxAdmin, saveInboxAdmin } from "@/lib/api/user/inbox.service";

const ROLES = ["ADMIN", "USER", "GUEST"] as const;

type Form = { enabled: boolean; roles: string[]; quotaGB: string; allowNoExpiry: boolean };

function toForm(data: AdminData): Form {
    return {
        enabled: data.settings.enabled,
        roles: data.settings.roles,
        quotaGB: String(Math.round((data.settings.quotaMB / 1024) * 100) / 100),
        allowNoExpiry: data.settings.allowNoExpiry,
    };
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
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

// ADMIN only: switch upload links on or off, who may make them, and every user's links
export function InboxAdminSettings() {
    const [data, setData] = useState<AdminData | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // State is only set once the request settles, so this is safe to start from an effect
    const load = useCallback((resetForm: boolean) => {
        return fetchInboxAdmin()
            .then((next) => {
                setData(next);
                if (resetForm) setForm(toForm(next));
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the settings."));
    }, []);

    useEffect(() => {
        void load(true);
    }, [load]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form) return;
        setError(null);
        const quotaMB = Math.round(Number(form.quotaGB) * 1024);
        if (!Number.isFinite(quotaMB) || quotaMB < 0) return setError("Quota must be a number of GB (0 = no limit).");

        setSaving(true);
        try {
            const saved = await saveInboxAdmin({
                enabled: form.enabled,
                roles: form.roles as AdminData["settings"]["roles"],
                quotaMB,
                allowNoExpiry: form.allowNoExpiry,
            });
            setData(saved);
            setForm(toForm(saved));
            toast.success("Upload link settings saved");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    async function toggle(id: string, closed: boolean) {
        try {
            await adminCloseInbox(id, closed);
            await load(false);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not change the link.");
        }
    }

    if (!data || !form) {
        return error ? <p className="text-xs text-red-400">{error}</p> : <p className="text-xs text-slate-500">Loading...</p>;
    }

    return (
        <div className="space-y-8">
            <form onSubmit={handleSave} className="space-y-4">
                <Toggle
                    id="inbox-enabled"
                    label="Allow upload links"
                    hint="Off: every upload link stops working at once (they come back when switched on again)."
                    checked={form.enabled}
                    onChange={(enabled) => setForm({ ...form, enabled })}
                />
                <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-200">Who may create them</p>
                    <div className="flex flex-wrap gap-4">
                        {ROLES.map((role) => (
                            <Toggle
                                key={role}
                                id={`inbox-role-${role}`}
                                label={role}
                                checked={form.roles.includes(role)}
                                onChange={(on) => setForm({ ...form, roles: on ? [...form.roles, role] : form.roles.filter((r) => r !== role) })}
                            />
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-500">
                        Links of a role taken out here stop working. Files are always saved with the owner&apos;s own folder rights.
                    </p>
                </div>
                <Toggle
                    id="inbox-no-expiry"
                    label="Allow links that never close"
                    checked={form.allowNoExpiry}
                    onChange={(allowNoExpiry) => setForm({ ...form, allowNoExpiry })}
                />
                <div className="max-w-xs space-y-2">
                    <Label htmlFor="inbox-quota">Received per user, all links together (GB)</Label>
                    <Input id="inbox-quota" type="number" min={0} step="any" value={form.quotaGB} onChange={(e) => setForm({ ...form, quotaGB: e.target.value })} />
                    <p className="text-[11px] text-slate-500">0 = no limit. Deleting a link gives its space back.</p>
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button type="submit" disabled={saving} className="gap-1">
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save"}
                </Button>
            </form>

            <section className="space-y-2">
                <p className="text-sm font-semibold text-slate-200">All upload links ({data.inboxes.length})</p>
                {data.inboxes.length === 0 ? (
                    <p className="text-xs text-slate-500">Nobody has made one yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {data.inboxes.map((inbox) => (
                            <li key={inbox.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3">
                                <div className="min-w-0 space-y-0.5">
                                    <p className="flex flex-wrap items-center gap-2 break-all text-sm font-medium text-slate-100">
                                        {inbox.title}
                                        <Badge variant="outline">{inbox.status}</Badge>
                                    </p>
                                    <p className="break-all text-xs text-slate-500">
                                        {inbox.owner} · <span className="font-mono">{inbox.targetPath}</span> · {inbox.fileCount} file{inbox.fileCount === 1 ? "" : "s"},{" "}
                                        {formatSize(inbox.usedBytes, true)} · {inbox.expiresAt ? `closes ${formatDate(inbox.expiresAt)}` : "never closes"}
                                    </p>
                                    <p className="break-all font-mono text-[11px] text-slate-600">{inbox.url}</p>
                                </div>
                                {inbox.status !== "expired" && (
                                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => void toggle(inbox.id, inbox.closedAt === null)}>
                                        {inbox.closedAt ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                        {inbox.closedAt ? "Reopen" : "Pause"}
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
