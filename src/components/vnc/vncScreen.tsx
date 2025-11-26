// components/vnc/VncClient.tsx (แนะนำให้สร้างไฟล์ใหม่ชื่อนี้แทน VncScreen เดิม)
'use client';

import { useEffect } from 'react';
import { useVncConnection } from '@/hooks/useVncConnection';
import { Card } from '@/components/ui/card';
import VncStatus from './vncStatus';
import VncControls from './vncControls';

interface VncClientProps {
    wsUrl: string;
}

export default function VncClient({ wsUrl }: VncClientProps) {
    const { screenRef, rfbRef, connect, disconnect, status } = useVncConnection(wsUrl);

    useEffect(() => {
        connect();
    }, []); 

    return (
        <div className="space-y-4 max-w-5xl mx-auto">
            {/* Header Bar: Status & Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold">Server Console</h2>
                    <VncStatus status={status} />
                </div>

                <VncControls
                    rfbRef={rfbRef}
                    status={status}
                    onConnect={connect}
                    onDisconnect={disconnect}
                />
            </div>

            {/* VNC Screen Area */}
            <Card
                id="vnc-container"
                className="relative w-full aspect-video bg-black overflow-hidden border-slate-800 shadow-xl"
            >
                <div
                    ref={screenRef}
                    className="w-full h-full flex items-center justify-center [&>canvas]:max-w-full [&>canvas]:max-h-full"
                />

                {/* Loading Overlay */}
                {status === 'connecting' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white z-10">
                        Waiting for server...
                    </div>
                )}
            </Card>
        </div>
    );
}