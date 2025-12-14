"use client";

import { Button } from "@/components/ui/button";
import { Share2Icon } from "lucide-react";
import { useRouter } from "next/navigation";

export function SharelinkRoute() {
    const router = useRouter();

    async function haddleSharelink() {
        router.push("/share")
    }

    return (
        <>
            <Button onClick={haddleSharelink} variant={"ghost"} className="w-full justify-start gap-2 ">
                <Share2Icon className="w-4 h-4" />
                <span>Share Link</span>
            </Button>
        </>
    );
}
