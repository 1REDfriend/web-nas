"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaKind, rawFileUrl } from "@/lib/file-manager/media";

type MediaPreviewProps = {
    path: string;
    name: string;
    kind: MediaKind;
};

// Render with key={path} so a new file starts with a fresh error state
export function MediaPreview({ path, name, kind }: MediaPreviewProps) {
    const [failed, setFailed] = useState(false);
    const src = rawFileUrl(path);

    if (failed) {
        return (
            <p className="text-slate-500">
                This file cannot be shown here. You may not have permission to open it.
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {kind === "image" && (
                // next/image cannot optimise files behind the session-checked API
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={name}
                    onError={() => setFailed(true)}
                    className="max-h-[320px] w-full rounded-md bg-slate-900/60 object-contain"
                />
            )}
            {kind === "video" && (
                <video
                    src={src}
                    controls
                    preload="metadata"
                    onError={() => setFailed(true)}
                    className="max-h-[320px] w-full rounded-md bg-black"
                />
            )}
            {kind === "audio" && (
                <audio src={src} controls preload="metadata" onError={() => setFailed(true)} className="w-full" />
            )}

            <Button asChild size="sm" variant="outline" className="text-xs">
                <a href={src} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open full size
                </a>
            </Button>
        </div>
    );
}
