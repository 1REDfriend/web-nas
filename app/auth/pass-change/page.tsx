'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label";
import { passChange } from "@/lib/api/auth/pass-change";
import { logerror } from "@/lib/logger";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LoginResponse =
    | {
        message: string;
        user?: { name?: string } | string;
    };

export default function PassChange() {

    const [username, setUsername] = useState("");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);

    const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        setError(null);
        setUserName(null);

        if (!username || !oldPassword || !newPassword || !confirmPassword) {
            setError("Please enter both your username and password.");
            return;
        }

        if (newPassword != confirmPassword) {
            setError("Confirm password not same!")
            return
        }

        try {
            setLoading(true);

            const data: LoginResponse = await passChange(username, oldPassword, newPassword);

            setMessage(data?.message || "Login successful");

            if (typeof data?.user === "string") {
                setUserName(data.user);
            } else if (data?.user && typeof data.user === "object") {
                setUserName(data.user.name ?? null);
            }

            setUsername("");
            setOldPassword("");
            setNewPassword("");
            setConfirmPassword("");
            router.push("/auth/login");
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
                    <CardTitle>Pass Change</CardTitle>
                    <CardDescription>
                        passchange in with your account
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
                            <Label htmlFor="password">Old Password</Label>
                            <Input
                                id="oldPassword"
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="password">New Password</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="password">Confirm Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 mt-1">
                                {error}
                            </p>
                        )}

                        {message && (
                            <div className="mt-1 text-xs text-emerald-400 space-y-1">
                                <p>{message}</p>
                                {userName && (
                                    <p>
                                        User: <span className="font-semibold">{userName}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full mt-2"
                            disabled={loading}
                        >
                            {loading ? "Changing in..." : "Change Please"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
} 