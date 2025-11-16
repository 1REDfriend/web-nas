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
import { useRouter } from "next/navigation";
import { logerror } from "@/lib/logger";

export default function RegisterPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        setError(null);

        if (!username || !password) {
            setError("Please enter both your username and password.");
            return;
        }

        try {
            setLoading(true);

            const res = await fetch("/api/auth/registor", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data?.message || "Unsuccessful membership application");
                return;
            }

            setMessage(data?.message || "User registered successfully");
            setUsername("");
            setPassword("");
            router.push('/auth/login');
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
                    <CardTitle>Register</CardTitle>
                    <CardDescription>
                        Create your new account
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
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="new-password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 mt-1">
                                {error}
                            </p>
                        )}

                        {message && (
                            <p className="text-xs text-emerald-400 mt-1">
                                {message}
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
