"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logerror } from "@/lib/logger";
import { ImportedFolders } from "./ImportedFolders";

type ImportResponse = {
    success?: boolean;
    rootPath?: string;
    error?: string;
    message?: string;
};

function AddRootPathForm({ onAdded }: { onAdded: () => void }) {
    const [rootPath, setRootPath] = useState("");
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSuccessMsg(null);
        setErrorMsg(null);

        if (!rootPath.trim()) {
            setErrorMsg("Please enter rootPath first.");
            return;
        }

        try {
            setLoading(true);

            const res = await fetch("/api/files/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ virtualPath: rootPath.trim() }),
            });

            const data: ImportResponse = await res.json();

            if (!res.ok || !data?.success) {
                setErrorMsg(
                    data?.error || data?.message || "Failed to add rootPath. Please try again."
                );
                return;
            }

            setSuccessMsg(`RootPath added: ${data.rootPath ?? rootPath.trim()}`);
            setRootPath("");
            onAdded();
        } catch (err) {
            logerror(err + "");
            setErrorMsg("An error occurred connecting to the server.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <form className="space-y-3 rounded-lg border border-white/5 bg-slate-900/30 p-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
                <Label htmlFor="rootPath">Add root path</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        id="rootPath"
                        placeholder="For example, /mnt/disk1/files"
                        value={rootPath}
                        onChange={(e) => setRootPath(e.target.value)}
                    />
                    <Button type="submit" disabled={loading} className="gap-1">
                        <FolderPlus className="h-4 w-4" />
                        {loading ? "Adding..." : "Add"}
                    </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                    The folder is created if it does not exist and shows up in your file list.
                </p>
            </div>

            {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
            {successMsg && <p className="text-xs text-emerald-400">{successMsg}</p>}
        </form>
    );
}

// ADMIN only: the folders (root paths) each user has in their file list
export function StorageSettings() {
    // Bumped after an add so the list below loads again
    const [version, setVersion] = useState(0);

    return (
        <div className="space-y-6">
            <AddRootPathForm onAdded={() => setVersion((v) => v + 1)} />

            <section className="space-y-2">
                <p className="text-sm font-semibold text-slate-200">Root paths by user</p>
                <div className="rounded-lg border border-white/5 bg-slate-900/30 p-3">
                    <ImportedFolders key={version} />
                </div>
            </section>
        </div>
    );
}
