import type { Metadata } from "next";
import { InboxAdminSettings } from "@/components/settings/InboxAdminSettings";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { ADMINS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Upload link limits" };

export default async function InboxAdminPage() {
  await requirePageUser(ADMINS);

  return (
    <>
      <SettingsHeader
        title="Upload link limits"
        description="Upload links let people without an account send files into a user's folder."
      />
      <InboxAdminSettings />
    </>
  );
}
