'use client';

import { ENV } from '@/lib/ENV';
import { useMemo } from 'react';

export default function VncPage() {
    const src = useMemo(() => {
        // const vncHost = 'localhost';
        // const vncPort = '6081';

        // const params = new URLSearchParams({
        //     host: vncHost,
        //     port: vncPort,
        //     path: 'websockify',
        //     encrypt: '0',
        //     autoconnect: '1',
        //     resize: 'scale',
        // });

        return `https://${ENV.TERMINAL_HOST}`;
    }, []);

    return (
        <div className="w-full h-screen bg-black">
            <iframe
                src={src}
                className="w-full h-full border-0"
                allow="fullscreen"
            />
        </div>
    );
}