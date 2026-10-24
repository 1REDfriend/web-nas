"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0 gap-1"
            onClick={async () => {
                if (await copyText(text)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                } else {
                    toast.error("Copy failed. Select the text and copy it by hand.");
                }
            }}
        >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : label}
        </Button>
    );
}
