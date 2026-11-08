import type { Metadata } from "next";
import { PinPage } from "@/components/pin/PinPage";

// Public page behind a room link or QR code: joins the room with this PIN (no login)
export const metadata: Metadata = {
    title: "PIN room",
    robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ pin: string }> }) {
    const { pin } = await params;
    return <PinPage initialPin={/^\d{4,8}$/.test(pin) ? pin : ""} />;
}
