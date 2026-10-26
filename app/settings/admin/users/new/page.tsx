import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateUserForm } from "@/components/settings/CreateUserForm";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { ADMINS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requirePageUser(ADMINS);

  return (
    <>
      <Link
        href="/settings/admin/users"
        className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Users
      </Link>
      <SettingsHeader
        title="Add user"
        description="A password is generated for the new account. The user must change it at first login."
      />
      <CreateUserForm />
    </>
  );
}
