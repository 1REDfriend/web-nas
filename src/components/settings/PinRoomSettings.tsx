"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Lock, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatSize, formatTimeLeft } from "@/lib/file-manager/format";
import { PinAdminData, PinSettings, adminClosePinRoom, fetchPinAdmin, savePinAdmin } from "@/lib/api/user/pin.service";

type NumberField = Exclude<keyof PinSettings, "enabled">;

const FIELDS: { key: NumberField; label: string; hint?: string; min: number }[] = [
    { key: "roomMB", label: "Space per room (MB)", hint: "Files and notes together. This is the most one person can send.", min: 1 },
    { key: "fileMB", label: "Largest file (MB)", hint: "Big files go up in pieces, so Cloudflare's 100 MB cap does not apply.", min: 1 },
    { key: "maxItems", label: "Items per room", min: 1 },
    { key: "roomMinutes", label: "Room lifetime (minutes)", hint: "Counted from when the room is made; it is then deleted.", min: 5 },
    { key: "roomsPerIp", label: "Open rooms per IP", min: 1 },
    { key: "totalMB", label: "Space for all rooms (MB)", hint: "0 = no limit", min: 0 },
];

type Form = { enabled: boolean } & Record<NumberField, string>;

function toForm(settings: PinSettings): Form {
    return {
        enabled: settings.enabled,
        ...(Object.fromEntries(FIELDS.map((f) => [f.key, String(settings[f.key])])) as Record<NumberField, string>),
    };
}

// ADMIN only: turns PIN rooms on or off, sets their limits, and closes rooms
export function PinRoomSettings() {
    const [data, setData] = useState<PinAdminData | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const load = useCallback(async (resetForm: boolean) => {
        const next = await fetchPinAdmin();
        setData(next);
        if (resetForm) setForm(toForm(next.settings));
        setNow(Date.now());
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetchPinAdmin()
            .then((next) => {
                if (cancelled) return;
                setData(next);
                setForm(toForm(next.settings));
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the PIN room settings.");
            });
        // The room list keeps itself current; the form keeps what the admin typed
        const timer = setInterval(() => void load(false).catch(() => undefined), 10000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [load]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form || !data) return;
        setError(null);

        const values: Partial<PinSettings> = { enabled: form.enabled };
        for (const field of FIELDS) {
            const n = Number(form[field.key]);
            if (!Number.isInteger(n) || n < field.min) return setError(`${field.label} must be a whole number of at least ${field.min}.`);
            values[field.key] = n;
        }
        if (data.settings.enabled && !form.enabled && data.rooms.length > 0) {
            if (!window.confirm(`Turning PIN rooms off deletes the ${data.rooms.length} open room(s) and everything in them. Go on?`)) return;
        }

        setSaving(true);
        try {
            const saved = await savePinAdmin(values);
            setData(saved);
            setForm(toForm(saved.settings));
            toast.success("PIN room settings saved");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    async function closeRoom(id: string, pin: string) {
        if (!window.confirm(`Close room ${pin} and delete everything in it?`)) return;
        try {
            await adminClosePinRoom(id);
            await load(false);
            toast.success(`Room ${pin} closed`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Could not close the room.");
        }
    }

    if (!data || !form) {
        return error ? <p className="text-xs text-red-400">{error}</p> : <p className="text-xs text-slate-500">Loading...</p>;
    }

    return (
        <div className="space-y-6">
            <form onSubmit={handleSave} className="space-y-4">
                <label htmlFor="pin-enabled" className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                    <input
                        id="pin-enabled"
                        type="checkbox"
                        className="h-4 w-4 accent-rose-500"
                        checked={form.enabled}
                        onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                    />
                    Turn on PIN rooms
                </label>
                <p className="text-[11px] text-slate-500">
                    Anyone who can reach this site can then make a room at{" "}
                    <a href="/p" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-sky-400 hover:underline">
                        /p <ExternalLink className="h-3 w-3" />
                    </a>
                    . Rooms get a 4-digit PIN; more digits are used automatically when many rooms are open. Wrong PINs are rate limited.
                    Files are kept in the drop folder until the room ends.
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {FIELDS.map((field) => (
                        <div key={field.key} className="space-y-2">
                            <Label htmlFor={`pin-${field.key}`}>{field.label}</Label>
                            <Input
                                id={`pin-${field.key}`}
                                type="number"
                                min={field.min}
                                step={1}
                                value={form[field.key]}
                                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                            />
                            {field.hint && <p className="text-[11px] text-slate-500">{field.hint}</p>}
                        </div>
                    ))}
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                    Save
                </Button>
            </form>

            <section className="space-y-2">
                <p className="text-sm font-semibold text-slate-200">
                    Open rooms <span className="font-normal text-slate-500">({data.usage.rooms} · {formatSize(data.usage.bytes, true)})</span>
                </p>
                {data.rooms.length === 0 ? (
                    <p className="text-xs text-slate-500">No rooms are open.</p>
                ) : (
                    <ul className="space-y-1">
                        {data.rooms.map((room) => (
                            <li key={room.id} className="flex items-center gap-3 rounded-md border border-white/10 p-2 text-sm">
                                <span className="font-mono text-base tracking-widest text-slate-100">{room.pin}</span>
                                {room.locked && <Lock className="h-3.5 w-3.5 text-amber-300" aria-label="Locked" />}
                                <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={`Made ${formatDate(room.createdAt)}`}>
                                    {room.itemCount} item{room.itemCount === 1 ? "" : "s"} · {formatSize(room.usedBytes, true)} · ends {formatTimeLeft(room.expiresAt, now)} · {room.creatorIp}
                                </span>
                                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-slate-400 hover:text-red-400" aria-label={`Close room ${room.pin}`} onClick={() => closeRoom(room.id, room.pin)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
