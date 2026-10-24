import type { Metadata } from "next";
import { DropPage } from "@/components/drops/DropPage";

// Public page for a drop link (no login)
export const metadata: Metadata = {
    title: "Shared file",
    robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <DropPage id={id} />;
}
