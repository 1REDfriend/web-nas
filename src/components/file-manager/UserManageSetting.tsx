"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Shield, User as UserIcon, Mail } from "lucide-react";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
    fetchUsers,
    deleteUserById,
    type User
} from "@/lib/api/admin/user.service";

export function UserManageSetting() {
    const [users, setUsers] = useState<User[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await fetchUsers();

            if (res.users && Array.isArray(res.users)) {
                setUsers(res.users);
            } else {
                setUsers([]);
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to load users";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleDelete = useCallback(async (userId: string, username: string) => {
        if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
            return;
        }

        try {
            setLoading(true);
            setMessage(null);
            setError(null);

            const res = await deleteUserById(userId);

            setMessage(res.message);

            await loadData();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to delete user";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [loadData]);

    return (
        <div className="space-y-4 p-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-foreground">User Management</h2>
                <Button onClick={loadData} variant="outline" size="sm" disabled={loading}>
                    Refresh
                </Button>
            </div>

            {/* Message & Error Display */}
            {message && (
                <div className="p-3 text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-900 rounded-md">
                    {message}
                </div>
            )}

            {error && (
                <div className="p-3 text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-md">
                    {error}
                </div>
            )}

            {loading && users.length === 0 && (
                <p className="text-sm text-muted-foreground animate-pulse">Loading users...</p>
            )}

            {!loading && users.length === 0 && !error && (
                <p className="text-sm text-muted-foreground text-center py-8">
                    No users found.
                </p>
            )}

            {/* User Table */}
            {users.length > 0 && (
                <div className="rounded-md border border-white/10 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-900/50">
                            <TableRow>
                                <TableHead className="w-[200px]">Username</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Created At</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id} className="hover:bg-slate-900/30">
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <UserIcon className="h-4 w-4 text-muted-foreground" />
                                            <span>{user.username}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium 
                                        ${user.role === 'ADMIN'
                                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                            }`}
                                        >
                                            {user.role === 'ADMIN' && <Shield className="w-3 h-3 mr-1" />}
                                            {user.role}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                            {user.gmail ? (
                                                <>
                                                    <Mail className="w-3 h-3" />
                                                    {user.gmail}
                                                </>
                                            ) : (
                                                <span className="opacity-50">-</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {new Date(user.createdAt).toLocaleDateString('th-TH', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/50"
                                            onClick={() => handleDelete(user.id, user.username)}
                                            disabled={loading}
                                            title="Delete User"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}