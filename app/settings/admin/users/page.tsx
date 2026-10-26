import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { UsersSettings } from "@/components/settings/UsersSettings";
import { ADMINS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Users" };

export default async function UsersSettingsPage() {
  await requirePageUser(ADMINS);

  return (
    <>
      <SettingsHeader
        title="Users"
        description="Everyone who can log in to this server."
        actions={
          <Button asChild className="gap-2">
            <Link href="/settings/admin/users/new">
              <UserPlus className="h-4 w-4" />
              Add user
            </Link>
          </Button>
        }
      />
      <UsersSettings />
    </>
  );
}
