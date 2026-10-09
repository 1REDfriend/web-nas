"use client";

import { useState } from "react";

// Image preview at the top of a grid card. Hides itself if the server cannot
// make one (unsupported format, too large, no permission) so the card keeps its icon.
// `src` is thumbnailUrl(...) or shareThumbnailUrl(...) from media.ts
export function Thumbnail({ src, name }: { src: string; name: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) return null;

    return (
        // Cancels the card's top padding so the image sits flush with its edge
        <div className="-mt-6 -mb-2 h-28 overflow-hidden rounded-t-xl bg-slate-950/60">
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
