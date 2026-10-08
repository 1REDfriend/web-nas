'use client';

import { useEffect, useState } from 'react';

// Web terminal (webssh behind Caddy). The host comes from the server at runtime
// (TERMINAL_HOST); without it the terminal is "<current host>:7255". Only
// rendered after the user opens the terminal, so `window` is available.
export default function VncPage() {
    const [host, setHost] = useState<string | null>(null);

    useEffect(() => {
        const fallback = `${window.location.hostname}:7255`;
        fetch('/api/auth/user-check')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setHost(data?.terminalHost || fallback))
            .catch(() => setHost(fallback));
    }, []);

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
