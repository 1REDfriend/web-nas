// app/auth/registor/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from "@/components/ui/card";
import { logerror } from "@/lib/logger";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CreateUserPage() {
    const [username, setUsername] = useState("");
    const [role, setRole] = useState<"ADMIN" | "USER">()

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null);

    const handleSelect = (value: string) => {
        setRole(value as "ADMIN" | "USER");
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        setError(null);

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
                setError(data?.message || "Unsuccessful membership application");
                return;
            }

            setMessage(data?.message || "User registered successfully");
            setPassword(data?.password);
            setUsername(data?.username);
            setUsername("");
        } catch (err) {
            logerror(err + "");
            setError("An error occurred connecting to the server.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 px-4">
            <Card className="w-full max-w-md border-white/10 bg-slate-950/80 backdrop-blur">
                <CardHeader>
                    <CardTitle>Create User by Admin</CardTitle>
                    <CardDescription>
                        Create your new account will be auto generate password.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={handleSubmit}>
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
                            <Select onValueChange={handleSelect} value={role}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select a Role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Role</SelectLabel>
                                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                                        <SelectItem value="USER">USER</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 mt-1">
                                {error}
                            </p>
                        )}

                        {message && (
                            <p className="flex text-xs text-emerald-400 mt-1">
                                {message}
                                <span>Username: {username}</span> 
                                <span>Password: {password}</span> 
                            </p>
                        )}

                        <Button
                            type="submit"
                            className="w-full mt-2"
                            disabled={loading}
                        >
                            {loading ? "Applying..." : "Apply for membership"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
