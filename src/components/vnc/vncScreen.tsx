'use client';

import { useMemo } from 'react';

export default function VncPage() {
    const src = useMemo(() => {
        const params = new URLSearchParams({
            host: 'localhost',
            port: '3001',
            path: 'vnc',
            autoconnect: '1',
            encrypt: '0',
        });

        return `/novnc/vnc.html?${params.toString()}`;
    }, []);

    return (
        <div className="w-full h-screen bg-black">
            <iframe
                src={src}
                className="w-full h-full border-0"
                allowFullScreen
            />
        </div>
    );
}
