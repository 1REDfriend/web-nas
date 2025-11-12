// src/components/Terminal.tsx
'use client';
import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import 'xterm/css/xterm.css';
import { AttachAddon } from 'xterm-addon-attach';

export function Terminal() {
    const termRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!termRef.current) return;

        const term = new XTerm({ cursorBlink: true });

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${protocol}://${window.location.host}/ws`;
        const ws = new WebSocket(url);

        const attachAddon = new AttachAddon(ws);
        term.loadAddon(attachAddon);

        term.open(termRef.current);
        term.write('Connecting to server shell...\r\n');

        return () => {
            ws.close();
            term.dispose();
        };
    }, []);

    return <div ref={termRef} style={{ height: '400px', width: '100%' }} />;
}