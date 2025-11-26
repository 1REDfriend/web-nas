'use client';

import { RFBConnection } from '@/interfaces/RFB';
import { logerror } from '@/lib/logger';
import { useEffect, useRef, useState } from 'react';

export const useVncConnection = (url: string, password?: string) => {
    const rfbRef = useRef<RFBConnection | null>(null);
    const screenRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

    const connect = async () => {
        if (!screenRef.current || !url) return;
        setStatus('connecting');

        try {
            if (typeof window !== 'undefined') {
                const win = window as Window & { exports?: object };
                
                if (!win.exports) {
                    win.exports = {};
                }
            }
            const rfbModule = await import('@novnc/novnc/lib/rfb');
            const RFB = rfbModule.default || rfbModule;

            const rfb = new RFB(screenRef.current, url, {
                credentials: {
                    password: password || '',
                    username: '',
                    target: '',
                },
            });

            rfb.addEventListener('connect', () => setStatus('connected'));
            rfb.addEventListener('disconnect', () => setStatus('disconnected'));
            rfb.addEventListener('securityfailure', () => setStatus('error'));

            rfb.scaleViewport = true;
            rfb.resizeSession = true;

            rfbRef.current = rfb;
        } catch (error : unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logerror(`Failed to load NoVNC: ${errorMessage}`);
            setStatus('error');
        }
    };

    const disconnect = () => {
        if (rfbRef.current) {
            rfbRef.current.disconnect();
            rfbRef.current = null;
        }
    };

    useEffect(() => {
        return () => disconnect();
    }, []);

    return { screenRef, connect, disconnect, status, rfbRef };
};