import type { Metadata } from "next";
import { InboxesSettings } from "@/components/settings/InboxesSettings";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { MEMBERS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "Upload links" };

// ?path=/folder opens the form with that folder filled in (from the file manager's folder menu)
export default async function InboxesSettingsPage({ searchParams }: { searchParams: Promise<{ path?: string | string[] }> }) {
  await requirePageUser(MEMBERS);
  const { path } = await searchParams;

  return (
    <>
      <SettingsHeader
        title="Upload links"
        description="Give people a link that lets them send files into one of your folders, without an account."
      />
      <InboxesSettings initialPath={typeof path === "string" ? path : undefined} />
    </>
  );
}
