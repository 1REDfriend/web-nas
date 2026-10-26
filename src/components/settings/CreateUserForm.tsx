"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logerror } from "@/lib/logger";
import { CopyButton } from "@/components/file-manager/CopyButton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateUserForm() {
    const [username, setUsername] = useState("");
    const [role, setRole] = useState<"ADMIN" | "USER" | "GUEST">()

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [created, setCreated] = useState<{ username: string; password: string } | null>(null)
    const [error, setError] = useState<string | null>(null);

    const handleSelect = (value: string) => {
        setRole(value as "ADMIN" | "USER" | "GUEST");
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        setError(null);
        setCreated(null);

        if (!username || !role) {
            setError("Please enter both your username or role.");
            return;
        }

        try {
            setLoading(true);

            const res = await fetch("/api/admin/user/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username, role }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data?.error || data?.message || "Unsuccessful membership application");
                return;
            }

            setMessage(data?.message || "User registered successfully");
            setCreated({ username: data.user.username, password: data.user.tempPassword });
            setUsername("");
        } catch (err) {
            logerror(err + "");
            setError("An error occurred connecting to the server.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <form className="max-w-md space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
                <Label htmlFor="username">Username</Label>
                <Input
                    id="username"
                    autoComplete="username"
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />
            </div>

            <div className="space-y-1">
                <Label htmlFor="role">Role</Label>
                <Select onValueChange={handleSelect} value={role}>
                    <SelectTrigger id="role" className="w-[180px]">
                        <SelectValue placeholder="Select a Role" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectLabel>Role</SelectLabel>
                            <SelectItem value="ADMIN">ADMIN</SelectItem>
                            <SelectItem value="USER">USER</SelectItem>
                            <SelectItem value="GUEST">GUEST</SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {error && (
                <p className="text-xs text-red-400 mt-1">
                    {error}
                </p>
            )}

            {message && created && (
                <div className="space-y-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    <p>{message}</p>
                    <p>Username: <span className="font-mono">{created.username}</span></p>
                    <div className="flex items-center gap-2">
                        <p>Temporary password: <span className="font-mono select-all">{created.password}</span></p>
                        <CopyButton text={created.password} label="Copy" />
                    </div>
                    <p className="text-emerald-400/80">
                        Copy it now, it is shown only once. The user must change it at first login.
                    </p>
                </div>
            )}

            <Button
                type="submit"
                className="w-full mt-2"
                disabled={loading}
            >
                {loading ? "Creating..." : "Create user"}
            </Button>
        </form>
    );
}
