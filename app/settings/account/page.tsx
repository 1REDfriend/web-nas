import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Profile" };

export default async function AccountSettingsPage() {
  const user = await requirePageUser();

  return (
    <>
      <SettingsHeader title="Profile" description="Your account on this server." />

      <div className="space-y-6">
        <section className="rounded-lg border border-white/5 bg-slate-900/30 p-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-xs text-slate-500">Username</dt>
              <dd className="font-medium text-slate-100">{user.username}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-slate-500">Role</dt>
              <dd>
                <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
              </dd>
            </div>
          </dl>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-slate-900/30 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-200">Password</p>
            <p className="text-xs text-slate-400">You will be logged out of every device after the change.</p>
          </div>
          <Button asChild variant="secondary" className="gap-2">
            <Link href="/auth/pass-change">
              <KeyRound className="h-4 w-4" />
              Change password
            </Link>
          </Button>
        </section>
      </div>
    </>
  );
}
