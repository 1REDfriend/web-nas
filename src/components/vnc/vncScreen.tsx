'use client';

import { ENV } from '@/lib/ENV';

// Web terminal (webssh behind Caddy on :7255). Defaults to the host the file
// manager was opened on, so the login cookie is sent and Caddy lets it through.
// Only rendered after the user opens the terminal, so `window` is available.
export default function VncPage() {
    const host = ENV.TERMINAL_HOST || (typeof window !== 'undefined' ? `${window.location.hostname}:7255` : '');

    return (
        <div className="w-full h-screen bg-black">
            {host && (
                <iframe
                    src={`https://${host}`}
                    className="w-full h-full border-0"
                    allow="fullscreen"
                />
            )}
        </div>
    );
}
