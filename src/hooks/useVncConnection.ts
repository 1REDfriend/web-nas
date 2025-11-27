'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RFBConnection } from '@/interfaces/RFB';
import { logerror } from '@/lib/logger';

type VncStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export const useVncConnection = (url: string, password?: string) => {
    const screenRef = useRef<HTMLDivElement | null>(null);
    const rfbRef = useRef<RFBConnection | null>(null);
    const [status, setStatus] = useState<VncStatus>('disconnected');

    const ensureBrowserGlobals = () => {
        if (typeof window === 'undefined') return;

        // Use globalThis to catch any bundler/global variants
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = globalThis as any;

        const ua =
            typeof navigator !== 'undefined' && navigator.userAgent
                ? navigator.userAgent
                : '';

        const isMatch = (regex: RegExp) => regex.test(ua);

        const makeBrowserImpl = () => ({
            isWindows: () => isMatch(/Win/),
            isMac: () => isMatch(/Mac/),
            isIOS: () => isMatch(/iPad|iPhone|iPod/),
            isAndroid: () => isMatch(/Android/),
            isTouch: () =>
                'ontouchstart' in window ||
                navigator.maxTouchPoints > 0 ||
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (navigator as any).msMaxTouchPoints > 0,
            isMobile: () => isMatch(/Mobi|Android|iPhone|iPad|iPod/),
        });

        const current = g.browser;

        const needPatch =
            !current ||
            typeof current.isMac !== 'function' ||
            typeof current.isWindows !== 'function';

        if (needPatch) {
            g.browser = makeBrowserImpl();
        }

        if (g.window && !g.window.browser) {
            g.window.browser = g.browser;
        }

        if (!g.exports) {
            g.exports = {};
        }
    };

    const disconnect = useCallback(() => {
        if (!rfbRef.current) {
            setStatus((prev) => (prev === 'connecting' ? 'disconnected' : prev));
            return;
        }

        try {
            rfbRef.current.disconnect();
        } catch (error) {
            logerror(
                `[noVNC] Error while disconnecting: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        } finally {
            rfbRef.current = null;
            setStatus('disconnected');
        }
    }, []);

    const connect = useCallback(async () => {
        if (typeof window === 'undefined') return;

        if (!screenRef.current) {
            logerror('[noVNC] Screen container ref is not attached.');
            return;
        }

        // Avoid duplicate sessions
        if (rfbRef.current) {
            disconnect();
        }

        setStatus('connecting');

        try {
            ensureBrowserGlobals();

            // Dynamic import; Next.js / Turbopack friendly
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const rfbModule = await import('@novnc/novnc/lib/rfb');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const RFB: any = (rfbModule as any).default ?? rfbModule;

            const options = password ? { credentials: { password } } : {};

            const rfb: RFBConnection = new RFB(screenRef.current, url, options);

            rfbRef.current = rfb;

            // Enable scaling / resizing
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (rfb as any).scaleViewport = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (rfb as any).resizeSession = true;

            const handleConnect = () => {
                setStatus('connected');
            };

            const handleDisconnect = () => {
                rfbRef.current = null;
                setStatus('disconnected');
            };

            const handleSecurityFailure = (e: unknown) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const detail = (e as any)?.detail;
                logerror(
                    `[noVNC] Security failure: ${
                        detail?.status || detail?.reason || JSON.stringify(detail) || 'unknown'
                    }`,
                );
                rfbRef.current = null;
                setStatus('error');
            };

            // noVNC RFB instances use addEventListener
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (rfb as any).addEventListener('connect', handleConnect);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (rfb as any).addEventListener('disconnect', handleDisconnect);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (rfb as any).addEventListener('securityfailure', handleSecurityFailure);
        } catch (error) {
            logerror(
                `[noVNC] Failed to establish VNC connection: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            rfbRef.current = null;
            setStatus('error');
        }
    }, [disconnect, password, url]);

    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        screenRef,
        connect,
        disconnect,
        status,
        rfbRef,
    };
};
