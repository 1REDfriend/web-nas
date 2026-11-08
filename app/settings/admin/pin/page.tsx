import type { Metadata } from "next";
import { PinRoomSettings } from "@/components/settings/PinRoomSettings";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { ADMINS } from "@/components/settings/sections";
import { requirePageUser } from "@/lib/security/page-session";

export const metadata: Metadata = { title: "PIN rooms" };

export default async function PinRoomSettingsPage() {
    await requirePageUser(ADMINS);

    return (
        <>
            <SettingsHeader
                title="PIN rooms"
                description="A public page at /p where anyone, without an account, can make a room and share files and notes with whoever has its PIN."
            />
            <PinRoomSettings />
        </>
    );
}
