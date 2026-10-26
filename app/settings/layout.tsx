import type { Metadata } from "next";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = {
  title: {
    template: "%s · Settings",
    default: "Settings",
  },
};

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requirePageUser();
  return <SettingsShell role={user.role}>{children}</SettingsShell>;
}
