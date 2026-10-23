"use client";

import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

// Image preview for a file in a list or grid. Shows `fallback` (usually the file
// icon) if the server cannot make one: unsupported format, too large, no permission.
// `src` is thumbnailUrl(...) or shareThumbnailUrl(...) from media.ts
export function Thumbnail({
    src,
    name,
    className,
    fallback = null,
}: {
    src: string;
    name: string;
    className?: string;
    fallback?: ReactNode;
}) {
    const [failed, setFailed] = useState(false);
    if (failed) return <>{fallback}</>;

    return (
        <div className={cn("overflow-hidden bg-slate-950/60", className)}>
            {/* next/image cannot optimise files behind the session-checked API */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={name}
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
            />
        </div>
    );
}
