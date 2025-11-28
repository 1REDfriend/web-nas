"use client";

import { ReactNode } from "react";

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
    ArrowLeft,
    RefreshCcw,
    ClipboardPaste,
} from "lucide-react";

type ComtextMenuBarProps = {
    children: ReactNode;
    onBack: () => void,
    onForward: () => void,
    onReload: () => void,
    onPaste: () => void,
};

export function ContextMenuBar({
    children, 
    onBack,
    onForward,
    onReload,
    onPaste,
}: ComtextMenuBarProps ) {
    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {/* right-click ได้ทั้งหน้าที่ห่อด้วย ComtextMenuBar */}
                    <div className="relative min-h-screen">
                        {children}
                    </div>
                </ContextMenuTrigger>

                {/* context menu หลัก */}
                <ContextMenuContent className="min-w-[220px] rounded-xl border border-slate-800/80 bg-slate-900/95 backdrop-blur-md shadow-xl shadow-black/40 py-1">
                    {/* Navigation group */}
                    <ContextMenuItem
                        inset
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 text-slate-400" />
                        <span>Back</span>
                    </ContextMenuItem>

                    <ContextMenuItem
                        inset
                        onClick={onForward}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 rotate-180 text-slate-400" />
                        <span>Forward</span>
                    </ContextMenuItem>

                    <ContextMenuItem
                        inset
                        onClick={onReload}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <RefreshCcw className="h-3.5 w-3.5 text-slate-400" />
                        <span>Reload</span>
                    </ContextMenuItem>

                    <ContextMenuSeparator className="my-1 bg-slate-800/80" />

                    <ContextMenuItem
                        inset
                        onClick={onPaste}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <ClipboardPaste className="h-3.5 w-3.5 text-slate-400" />
                        <span>Paste</span>
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        </>
    );
}