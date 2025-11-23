"use client";

import { ReactNode, useState } from "react";

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
    ContextMenuShortcut,
} from "@/components/ui/context-menu";
import {
    ArrowLeft,
    RefreshCcw,
    Share2,
    Scissors,
    Copy,
    ClipboardPaste,
} from "lucide-react";

type ComtextMenuBarProps = {
    children: ReactNode;
};

export function ContextMenuBar({ children }: ComtextMenuBarProps) {
    const [shareOpen, setShareOpen] = useState(false);

    const handleAction = (action: string) => {
        console.log("[ContextMenu action]:", action);
    };

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
                        onClick={() => handleAction("back")}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 text-slate-400" />
                        <span>Back</span>
                    </ContextMenuItem>

                    <ContextMenuItem
                        inset
                        disabled
                        onClick={() => handleAction("forward")}
                        className="flex items-center gap-2 text-slate-500 focus:bg-slate-800/80"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 rotate-180 text-slate-500" />
                        <span>Forward</span>
                    </ContextMenuItem>

                    <ContextMenuItem
                        inset
                        onClick={() => handleAction("reload")}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <RefreshCcw className="h-3.5 w-3.5 text-slate-400" />
                        <span>Reload</span>
                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500">
                            Ctrl + R
                        </ContextMenuShortcut>
                    </ContextMenuItem>

                    <ContextMenuSeparator className="my-1 bg-slate-800/80" />

                    {/* Share → ไม่ใช้ submenu แล้ว เปิด dialog แทน */}
                    <ContextMenuItem
                        inset
                        onClick={() => setShareOpen(true)}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <Share2 className="h-3.5 w-3.5 text-slate-400" />
                        <span>Share...</span>
                    </ContextMenuItem>

                    <ContextMenuSeparator className="my-1 bg-slate-800/80" />

                    {/* Clipboard group */}
                    <ContextMenuItem
                        inset
                        onClick={() => handleAction("cut")}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <Scissors className="h-3.5 w-3.5 text-slate-400" />
                        <span>Cut</span>
                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500">
                            Ctrl + X
                        </ContextMenuShortcut>
                    </ContextMenuItem>

                    <ContextMenuItem
                        inset
                        onClick={() => handleAction("copy")}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        <span>Copy</span>
                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500">
                            Ctrl + C
                        </ContextMenuShortcut>
                    </ContextMenuItem>

                    <ContextMenuItem
                        inset
                        onClick={() => handleAction("paste")}
                        className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                    >
                        <ClipboardPaste className="h-3.5 w-3.5 text-slate-400" />
                        <span>Paste</span>
                        <ContextMenuShortcut className="ml-auto text-xs text-slate-500">
                            Ctrl + V
                        </ContextMenuShortcut>
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        </>
    );
}