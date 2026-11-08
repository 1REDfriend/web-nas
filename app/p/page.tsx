import type { Metadata } from "next";
import { PinPage } from "@/components/pin/PinPage";

// Public page: join a PIN room or make one (no login)
export const metadata: Metadata = {
    title: "PIN room",
    robots: { index: false, follow: false },
};

export default function Page() {
    return <PinPage />;
}
