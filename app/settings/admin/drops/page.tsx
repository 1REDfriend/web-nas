import type { Metadata } from "next";
import { DropLimitsSettings } from "@/components/settings/DropLimitsSettings";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { ADMINS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Drop limits" };

export default async function DropLimitsSettingsPage() {
  await requirePageUser(ADMINS);

  return (
    <>
      <SettingsHeader
        title="Drop limits"
        description="Where drops are kept, how long they may live, how much space each user may use, and who may make request links."
      />
      <DropLimitsSettings />
    </>
  );
}
