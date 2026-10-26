import type { Metadata } from "next";
import { DropsSettings } from "@/components/settings/DropsSettings";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { MEMBERS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Drops" };

export default async function DropsSettingsPage() {
  await requirePageUser(MEMBERS);

  return (
    <>
      <SettingsHeader
        title="Drops"
        description="Share a file by link for a while. When the time is up, or it has been downloaded enough times, it is deleted on its own."
      />
      <DropsSettings />
    </>
  );
}
