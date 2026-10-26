import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { ADMINS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Storage" };

export default async function StorageSettingsPage() {
  await requirePageUser(ADMINS);

  return (
    <>
      <SettingsHeader
        title="Storage"
        description={
          <>
            Set up the <span className="font-mono text-xs">rootPath</span> folders of the file management system.
          </>
        }
      />
      <StorageSettings />
    </>
  );
}
