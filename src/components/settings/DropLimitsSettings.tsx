"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSize } from "@/lib/file-manager/format";
import { DropSettings, fetchDropSettings, saveDropSettings } from "@/lib/api/user/drop.service";

type Form = { folder: string; defaultHours: string; maxHours: string; quotaGB: string };

function toForm(settings: DropSettings): Form {
    return {
        folder: settings.folder.folder ?? "",
        defaultHours: String(settings.limits.defaultHours),
        maxHours: String(settings.limits.maxHours),
        quotaGB: String(Math.round((settings.limits.quotaMB / 1024) * 100) / 100),
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

    if (!settings || !form) {
        return error ? <p className="text-xs text-red-400">{error}</p> : <p className="text-xs text-slate-500">Loading...</p>;
    }

    const set = (field: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: e.target.value });

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

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end">
                <Button type="submit" disabled={saving} className="gap-1">
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save"}
                </Button>
            </div>
        </form>
    );
}
