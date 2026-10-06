"use client";

import { useCallback, useMemo, useState } from "react";
import { Pencil, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    FILE_ACTIONS,
    FILE_ACTION_LABELS,
    FileAction,
    RULE_ROLES,
    RuleRole,
} from "@/lib/security/file-actions";
import {
    PathRuleItem,
    deletePathRule,
    fetchPathRules,
    restoreDefaultPathRules,
    savePathRule,
} from "@/lib/api/admin/path-rule.service";

type RoleFilter = RuleRole | "ALL";

const EMPTY_FORM = {
    path: "",
    role: "USER" as RuleRole,
    actions: ["UPLOAD", "RENAME", "MOVE", "DELETE"] as FileAction[],
    recursive: true,
    note: "",
};

export function PathRuleSettingsDialog() {
    const [open, setOpen] = useState(false);
    const [rules, setRules] = useState<PathRuleItem[]>([]);
    const [systemProtected, setSystemProtected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
    const [form, setForm] = useState(EMPTY_FORM);

    const loadRules = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchPathRules();
            setRules(data.rules);
            setSystemProtected(data.systemProtected);
        } catch (err: unknown) {
            toast.error("Failed to load protected folders", {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }, []);

    function handleOpenChange(next: boolean) {
        setOpen(next);
        if (next) void loadRules();
    }

    const visibleRules = useMemo(
        () => (roleFilter === "ALL" ? rules : rules.filter((r) => r.role === roleFilter)),
        [rules, roleFilter]
    );

    function toggleAction(action: FileAction, checked: boolean) {
        setForm((prev) => ({
            ...prev,
            actions: checked
                ? [...prev.actions, action]
                : prev.actions.filter((a) => a !== action),
        }));
    }

    function editRule(rule: PathRuleItem) {
        setForm({
            path: rule.path,
            role: rule.role,
            actions: rule.actions,
            recursive: rule.recursive,
            note: rule.note ?? "",
        });
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();

        if (!form.path.trim()) {
            toast.error("Enter a folder path");
            return;
        }
        if (form.actions.length === 0) {
            toast.error("Select at least one action to block");
            return;
        }

        try {
            setSaving(true);
            await savePathRule({ ...form, path: form.path.trim() });
            toast.success("Rule saved", { description: `${form.path} (${form.role})` });
            setForm(EMPTY_FORM);
            await loadRules();
        } catch (err: unknown) {
            toast.error("Failed to save rule", {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(rule: PathRuleItem) {
        if (!window.confirm(`Remove protection on "${rule.path}" for ${rule.role}?`)) return;

        try {
            await deletePathRule(rule.id);
            toast.success("Rule removed");
            await loadRules();
        } catch (err: unknown) {
            toast.error("Failed to remove rule", {
                description: err instanceof Error ? err.message : undefined,
            });
        }
    }

    async function handleRestoreDefaults() {
        if (!window.confirm("Restore all built-in rules to their original settings? Your own rules are kept.")) return;

        try {
            await restoreDefaultPathRules();
            toast.success("Default rules restored");
            await loadRules();
        } catch (err: unknown) {
            toast.error("Failed to restore defaults", {
                description: err instanceof Error ? err.message : undefined,
            });
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant={"ghost"} className="w-full justify-start gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Protected Folders</span>
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-slate-950 border-white/10 text-slate-50 sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-rose-500">Protected Folders</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Block actions on a folder for one role. Paths are relative to the storage root.
                    </DialogDescription>
                </DialogHeader>

                <form className="grid gap-4 rounded-lg border border-white/5 bg-slate-900/30 p-4" onSubmit={handleSave}>
                    <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                        <div className="space-y-2">
                            <Label htmlFor="rule-path">Folder path</Label>
                            <Input
                                id="rule-path"
                                placeholder="/axite/important"
                                value={form.path}
                                onChange={(e) => setForm((prev) => ({ ...prev, path: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Role</Label>
                            <Select
                                value={form.role}
                                onValueChange={(value) => setForm((prev) => ({ ...prev, role: value as RuleRole }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {RULE_ROLES.map((role) => (
                                        <SelectItem key={role} value={role}>{role}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Blocked actions</Label>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {FILE_ACTIONS.map((action) => (
                                <label key={action} className="flex items-center gap-2 text-sm text-slate-300">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-rose-500"
                                        checked={form.actions.includes(action)}
                                        onChange={(e) => toggleAction(action, e.target.checked)}
                                    />
                                    {FILE_ACTION_LABELS[action]}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                        <div className="space-y-2">
                            <Label htmlFor="rule-note">Note</Label>
                            <Input
                                id="rule-note"
                                placeholder="Why this folder is protected"
                                value={form.note}
                                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-300 md:pb-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-rose-500"
                                checked={form.recursive}
                                onChange={(e) => setForm((prev) => ({ ...prev, recursive: e.target.checked }))}
                            />
                            Also protect everything inside
                        </label>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setForm(EMPTY_FORM)} disabled={saving}>
                            Clear
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving..." : "Save rule"}
                        </Button>
                    </div>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All roles</SelectItem>
                            {RULE_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>{role}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button variant="outline" className="gap-2" onClick={handleRestoreDefaults}>
                        <RotateCcw className="h-4 w-4" />
                        Restore defaults
                    </Button>
                </div>

                <div className="rounded-lg border border-white/5">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Path</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Blocked</TableHead>
                                <TableHead>Inside too</TableHead>
                                <TableHead>Note</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-slate-400">Loading...</TableCell>
                                </TableRow>
                            )}

                            {!loading && visibleRules.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-slate-400">No rules.</TableCell>
                                </TableRow>
                            )}

                            {!loading && visibleRules.map((rule) => (
                                <TableRow key={rule.id}>
                                    <TableCell className="font-mono text-xs">{rule.path}</TableCell>
                                    <TableCell>
                                        <Badge variant={rule.role === "ADMIN" ? "default" : "secondary"}>{rule.role}</Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[320px] whitespace-normal">
                                        <div className="flex flex-wrap gap-1">
                                            {rule.actions.length === FILE_ACTIONS.length ? (
                                                <Badge variant="destructive">Everything</Badge>
                                            ) : (
                                                rule.actions.map((a) => (
                                                    <Badge key={a} variant="outline">{a}</Badge>
                                                ))
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-400">{rule.recursive ? "Yes" : "No"}</TableCell>
                                    <TableCell className="text-xs text-slate-400 whitespace-normal">
                                        {rule.note}
                                        {rule.isDefault && <span className="ml-1 text-slate-500">(default)</span>}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button size="icon" variant="ghost" onClick={() => editRule(rule)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" onClick={() => handleDelete(rule)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {systemProtected.length > 0 && (
                    <div className="space-y-2 text-xs text-slate-400">
                        <p className="font-semibold text-slate-300">Always protected (cannot be changed here)</p>
                        <ul className="space-y-1">
                            {systemProtected.map((p) => (
                                <li key={p} className="font-mono">{p}</li>
                            ))}
                        </ul>
                        <p>
                            The app folder and its internal storage are locked for every role, including ADMIN.
                            Add more with <span className="font-mono">PROTECTED_PATHS</span> in <span className="font-mono">.env</span>.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
