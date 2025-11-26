'use client';

import { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Power, RefreshCw, Maximize, Keyboard } from 'lucide-react';
import { RFBConnection } from '@/interfaces/RFB';

interface VncControlsProps {
    rfbRef: RefObject<RFBConnection | null>;
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    onConnect: () => void;
    onDisconnect: () => void;
}

export default function VncControls({
    rfbRef,
    status,
    onConnect,
    onDisconnect,
}: VncControlsProps) {
    const sendCtrlAltDel = () => {
        if (rfbRef.current) {
            rfbRef.current.sendCtrlAltDel();
        }
    };

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            const vncElement = document.getElementById('vnc-container');
            vncElement?.requestFullscreen();
        }
    };

    return (
        <div className="flex flex-wrap gap-2 items-center p-2 bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
            {/* ปุ่ม Connect/Disconnect */}
            {status === 'connected' ? (
                <Button variant="destructive" size="sm" onClick={onDisconnect}>
                    <Power className="w-4 h-4 mr-2" />
                    Disconnect
                </Button>
            ) : (
                <Button variant="default" size="sm" onClick={onConnect} disabled={status === 'connecting'}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${status === 'connecting' ? 'animate-spin' : ''}`} />
                    Connect
                </Button>
            )}

            <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />

            {/* ปุ่มส่งคำสั่งพิเศษ */}
            <Button variant="outline" size="sm" onClick={sendCtrlAltDel} disabled={status !== 'connected'}>
                <Keyboard className="w-4 h-4 mr-2" />
                Ctrl+Alt+Del
            </Button>

            <Button variant="ghost" size="sm" onClick={toggleFullscreen} disabled={status !== 'connected'}>
                <Maximize className="w-4 h-4" />
            </Button>
        </div>
    );
}