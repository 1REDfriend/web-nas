"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { LogIn, Settings, UserPlus } from "lucide-react";
import { logerror } from "@/lib/logger";
import { Separator } from "../ui/separator";
import { PathMapSetting } from "./PathMapSetting";
import { useRouter } from "next/navigation";
import { UserManageSetting } from "./UserManageSetting";

type ImportResponse = {
    success?: boolean;
    rootPath?: string;
    message?: string;
};

export function RootPathSettingsDialog() {
    const [rootPath, setRootPath] = useState("");
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [currentRootPath, setCurrentRootPath] = useState<string | null>(null);

    const route = useRouter()

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
                    data?.message || "Failed to add rootPath. Please try again."
                );
                return;
            }

            const finalRoot = data.rootPath ?? rootPath.trim();
            setCurrentRootPath(finalRoot);
            setSuccessMsg(`RootPath added: ${finalRoot}`);
            setRootPath("");
        } catch (err) {
            logerror(err + "");
            setErrorMsg("An error occurred connecting to the server.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant={"ghost"} className="w-full justify-start gap-2 ">
                    <Settings className="w-4 h-4" />
                    <span>Setting</span>
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-slate-950 border-white/10 text-slate-50">
                <DialogHeader>
                    <DialogTitle className="text-rose-500">Settings</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Set up <span className="font-mono text-xs">rootPath</span> for
                        File management system
                    </DialogDescription>
                </DialogHeader>

                <Button
                    onClick={() => {
                        route.push("/auth/pass-change")
                    }}
                >
                    <LogIn /> Change Password!
                </Button>

                <Button
                    onClick={() => {
                        route.push("/admin/user/create")
                    }}
                >
                    <UserPlus /> Add User
                </Button>

                <form className="space-y-4 mt-2" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                        <Label htmlFor="rootPath">Add Root Path</Label>
                        <Input
                            id="rootPath"
                            placeholder="For example, D:\\Projects or /home/user/files"
                            value={rootPath}
                            onChange={(e) => setRootPath(e.target.value)}
                        />
                        <p className="text-[11px] text-slate-500">
                            body sent:{" "}
                            <code className="font-mono">{`{ rootPath: "..." }`}</code>
                        </p>
                    </div>

                    <div>
                        {errorMsg && (
                            <p className="text-xs text-red-400">{errorMsg}</p>
                        )}
                    </div>

                    {successMsg && (
                        <div className="text-xs text-emerald-400 space-y-1">
                            <p>{successMsg}</p>
                            {currentRootPath && (
                                <p className="text-slate-300">
                                    Use the current rootPath:{" "}
                                    <span className="font-mono text-[11px]">
                                        {currentRootPath}
                                    </span>
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <Button type="submit" disabled={loading}>
                            {loading ? "Recording..." : "Add rootPath"}
                        </Button>
                    </div>
                </form>

                <Separator className="bg-white/5" />

                <section className="space-y-4">
                    <p className="font-bold text-lg text-rose-500">User Management</p>
                    <div className="bg-slate-900/30 p-2 rounded-lg border border-white/5">
                        <UserManageSetting />
                    </div>
                </section>

                <Separator className="bg-white/5" />

                <section className="space-y-4">
                    <p className="font-bold text-lg text-rose-500">Import Management</p>
                    <div className="bg-slate-900/30 p-2 rounded-lg border border-white/5">
                        <PathMapSetting />
                    </div>
                </section>
            </DialogContent>
        </Dialog>
    );
}
