import type { Metadata } from "next";
import { ProtectedFoldersSettings } from "@/components/settings/ProtectedFoldersSettings";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { ADMINS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Protected folders" };

export default async function ProtectedFoldersSettingsPage() {
  await requirePageUser(ADMINS);

  return (
    <>
      <SettingsHeader
        title="Protected folders"
        description="Block actions on a folder for one role. Paths are relative to the storage root."
      />
      <ProtectedFoldersSettings />
    </>
  );
}
