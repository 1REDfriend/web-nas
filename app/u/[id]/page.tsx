import type { Metadata } from "next";
import { InboxPage } from "@/components/inbox/InboxPage";

// Public page for an upload link (no login)
export const metadata: Metadata = {
    title: "Send files",
    robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <InboxPage link={id} />;
}
