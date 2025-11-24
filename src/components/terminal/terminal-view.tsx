// src/components/terminal/terminal-view.tsx
import TerminalComponent from '@/components/terminal/term'; // Import ตัวที่ชื่อถูกแก้แล้ว
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Terminal as TerminalIcon, Minus, Square, X } from 'lucide-react';

interface TerminalViewWrapperProps {
    username?: string; // รับ prop นี้เข้ามา
}

export default function TerminalView({ username = 'guest' }: TerminalViewWrapperProps) {
    return (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-950 via-slate-950 to-black p-4 md:p-8">
            <Card className="w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-950/90 via-zinc-950/95 to-black/95 shadow-[0_0_80px_rgba(0,0,0,0.85)] ring-1 ring-white/5">
                <CardHeader className="flex flex-row items-center justify-between border-b border-zinc-800/70 bg-zinc-900/70 px-4 py-2.5 backdrop-blur">
                    {/* Controls... (เหมือนเดิม) */}
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50" />
                        <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                        <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50" />
                    </div>

                    {/* Title */}
                    <div className="flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                        <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="truncate">{username}@nextjs: ~</span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex w-24 justify-end">
                        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                            <span>Live session</span>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="border-t border-zinc-900/60 bg-gradient-to-b from-black/70 via-zinc-950/90 to-black/95 p-3 md:p-4">
                    <div className="relative h-[520px] overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-950 via-black to-zinc-950 shadow-inner shadow-black/70">
                        {/* ส่งค่า username ต่อไปให้ตัว Logic */}
                        <TerminalComponent username={username} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}