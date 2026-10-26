import type { Metadata } from "next";
import { ApiKeysSettings } from "@/components/settings/ApiKeysSettings";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { MEMBERS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysSettingsPage() {
  await requirePageUser(MEMBERS);

  return (
    <>
      <SettingsHeader
        title="API keys"
        description={
          <>
            Let another program or server use your files through <span className="font-mono text-xs">/api/v1</span>.
            A key can only do what you can, and only what you allow here.
          </>
        }
      />
      <ApiKeysSettings />
    </>
  );
}
