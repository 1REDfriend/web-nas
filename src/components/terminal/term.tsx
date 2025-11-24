// src/components/terminal/term.tsx
'use client';

import { executeCommand } from '@/lib/api/terminal/term.service'; // ตรวจสอบ Path นี้ให้ตรงกับที่วางไฟล์จริง
import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalComponentProps {
    username: string;
}

// เปลี่ยนชื่อจาก TerminalView เป็น TerminalComponent
export default function TerminalComponent({ username }: TerminalComponentProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermInstance = useRef<Terminal | null>(null);
    const currentLine = useRef<string>('');

    // ใช้ Ref เก็บ prompt เพื่อให้ค่าอัปเดตทันทีโดยไม่ต้อง Re-init terminal
    const promptRef = useRef('');

    useEffect(() => {
        // อัปเดต Prompt string เมื่อ username เปลี่ยน
        promptRef.current = `\r\n\x1b[1;32m${username}@nextjs-server\x1b[0m:\x1b[1;34m~\x1b[0m$ `;
    }, [username]);

    useEffect(() => {
        if (!terminalRef.current || xtermInstance.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"Fira Code", "Menlo", monospace',
            fontSize: 14,
            theme: {
                background: '#0c0c0c',
                foreground: '#cccccc',
                cursor: '#ffffff',
                selectionBackground: '#5c5c5c',
            },
            rows: 20,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        // ใส่ Timeout เล็กน้อยเพื่อให้ Container render เสร็จก่อนคำนวณขนาด
        setTimeout(() => {
            fitAddon.fit();
            term.focus();
        }, 100);

        xtermInstance.current = term;

        // Init Prompt
        promptRef.current = `\r\n\x1b[1;32m${username}@nextjs-server\x1b[0m:\x1b[1;34m~\x1b[0m$ `;
        term.write('Welcome to Web Terminal v1.0.0');
        term.write(promptRef.current);

        term.onData(async (key) => {
            const charCode = key.charCodeAt(0);

            if (charCode === 13) { // Enter
                const command = currentLine.current;

                if (command.trim() === 'clear') {
                    term.clear();
                    currentLine.current = '';
                    term.write(promptRef.current);
                    return;
                }

                try {
                    const output = await executeCommand(command);
                    term.write(output);
                } catch {
                    term.write(`\r\nError`);
                }

                currentLine.current = '';
                term.write(promptRef.current);
            } else if (charCode === 127) { // Backspace
                if (currentLine.current.length > 0) {
                    currentLine.current = currentLine.current.slice(0, -1);
                    term.write('\b \b');
                }
            } else {
                if (charCode >= 32) {
                    currentLine.current += key;
                    term.write(key);
                }
            }
        });

        // Handle Resize
        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            term.dispose();
            xtermInstance.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={terminalRef} className="w-full h-full min-h-[400px]" />;
}