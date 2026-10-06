'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label";
import { passChange } from "@/lib/api/auth/pass-change";
import { userLoginCheck } from "@/lib/api/user/userLoginCheck";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PassChange() {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [mustChange, setMustChange] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const router = useRouter();

    useEffect(() => {
        userLoginCheck().then((status) => {
            if (!status.login) {
                router.push("/auth/login");
                return;
            }
            setMustChange(status.mustChangePassword);
        });
    }, [router]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!oldPassword || !newPassword || !confirmPassword) {
            setError("Please fill in every field.");
            return;
        }

        if (newPassword != confirmPassword) {
            setError("New password and confirmation do not match.")
            return
        }

        setLoading(true);
        const result = await passChange(oldPassword, newPassword);
        setLoading(false);

        if (!result.ok) {
            setError(result.error);
            return;
        }

        router.push("/auth/login");
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 px-4">
            <Card className="w-full max-w-md border-white/10 bg-slate-950/80 backdrop-blur">
                <CardHeader>
                    <CardTitle>Change Password</CardTitle>
                    <CardDescription>
                        {mustChange
                            ? "Your account uses a temporary password. Set your own password to continue."
                            : "You will be logged out of every device after the change."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="space-y-1">
                            <Label htmlFor="oldPassword">Current Password</Label>
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
                            <Label htmlFor="newPassword">New Password</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                autoComplete="new-password"
                                placeholder="At least 8 characters"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="confirmPassword">Confirm New Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                autoComplete="new-password"
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

                        <Button
                            type="submit"
                            className="w-full mt-2"
                            disabled={loading}
                        >
                            {loading ? "Changing..." : "Change Password"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
