import type { Metadata } from "next";
import { DropsSettings } from "@/components/settings/DropsSettings";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { MEMBERS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Drops" };

export default async function DropsSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePageUser(MEMBERS);
  const { tab } = await searchParams;

  return (
    <>
      <SettingsHeader
        title="Drops"
        description="Send a file by link, or make a link that lets others send files to you. Drops are deleted on their own when their time is up."
      />
      <DropsSettings initialTab={tab === "receive" ? "receive" : "send"} />
    </>
  );
}
