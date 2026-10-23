"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, XIcon } from "lucide-react";
import { FileManagerSidebarNavProps, SidebarNavContent } from "./FileManagerSidebarNav";

// Below md the sidebar is hidden; this puts the same navigation, settings,
// log out and storage summary behind a ☰ button, sliding in from the left.
export function MobileNavDrawer({ onSelectFolder, ...props }: FileManagerSidebarNavProps) {
    const [open, setOpen] = useState(false);

    return (
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger asChild>
                <button
                    type="button"
                    aria-label="Open menu"
                    className="md:hidden -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-white/10"
                >
                    <Menu className="h-5 w-5" />
                </button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60" />
                <DialogPrimitive.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-white/10 bg-slate-950 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-slate-50 shadow-xl duration-200">
                    <div className="flex items-center justify-between px-4 pt-3">
                        <DialogPrimitive.Title className="text-sm font-bold text-slate-300">File Manager</DialogPrimitive.Title>
                        <DialogPrimitive.Description className="sr-only">Folders, settings and storage</DialogPrimitive.Description>
                        <DialogPrimitive.Close className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                            <XIcon className="h-5 w-5" />
                            <span className="sr-only">Close</span>
                        </DialogPrimitive.Close>
                    </div>
                    <SidebarNavContent
                        {...props}
                        onSelectFolder={(id) => {
                            onSelectFolder(id);
                            setOpen(false);
                        }}
                    />
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
