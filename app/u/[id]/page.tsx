import type { Metadata } from "next";
import { RequestPage } from "@/components/drops/RequestPage";

// Public page for a drop request: people send files to the link's owner (no login)
export const metadata: Metadata = {
    title: "Send files",
    robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <RequestPage link={id} />;
}
