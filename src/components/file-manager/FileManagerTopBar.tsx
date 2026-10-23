"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/components/ui/input-group";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, FolderPlus, Plus, Search, TerminalSquare, Upload } from "lucide-react";
import { CreateFolderDialog } from "./CreateFolderDialog";
import Link from "next/link";
import { UploadFileManager } from "./UploadFileManager";
import Image from "next/image";
import { fetchCurrentRole } from "@/lib/api/admin/path-rule.service";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { FileManagerSidebarNavProps } from "./FileManagerSidebarNav";

type FileManagerTopBarProps = {
    query?: string;
    searchCount?: number;
    openTools?: boolean;
    onQueryChange?: (value: string) => void;
    onOpenTerminal?: () => void;
    currentPath?: string;
    onUploaded?: () => void;
    // Shows the ☰ drawer on small screens, where the sidebar is hidden
    nav?: Omit<FileManagerSidebarNavProps, "extraSettings">;
};

export function FileManagerTopBar({
    query,
    searchCount,
    currentPath,
    onUploaded,
    onQueryChange,
    onOpenTerminal,
    openTools,
    nav,
}: FileManagerTopBarProps) {
    // The terminal is ADMIN-only (enforced by Caddy + /api/auth/terminal-check)
    const [canUseTerminal, setCanUseTerminal] = useState(false);
    // Phones: the search box takes over the whole bar while open
    const [searchOpen, setSearchOpen] = useState(false);
    // Phones: the "+" button opens these instead of their own toolbar buttons
    const [uploadOpen, setUploadOpen] = useState(false);
    const [folderOpen, setFolderOpen] = useState(false);

    const wantsTerminal = !!onOpenTerminal;
    const showTools = !!onQueryChange && (!!currentPath || !!openTools);

    useEffect(() => {
        if (!wantsTerminal) return;
        fetchCurrentRole().then((role) => setCanUseTerminal(role === "ADMIN"));
    }, [wantsTerminal]);

    function closeSearch() {
        setSearchOpen(false);
        onQueryChange?.("");
    }

    const resultCount = `${typeof searchCount === "number" ? searchCount : 0} result${searchCount === 1 ? "" : "s"}`;

    return (
        <>
            {/* Below md the drawer and sheets (z-50) must cover the header */}
            <header className="relative flex z-30 md:z-9999 items-center justify-between gap-2 w-full min-h-14 sm:min-h-16 bg-red-500/5 border-b border-white/10 px-3 sm:px-6 md:px-10 backdrop-blur">
                <div className="flex items-center gap-1">
                    {nav && (
                        <MobileNavDrawer
                            {...nav}
                            extraSettings={
                                canUseTerminal && (
                                    <Button variant="ghost" className="w-full justify-start gap-2" onClick={onOpenTerminal}>
                                        <TerminalSquare className="w-4 h-4" />
                                        <span>Terminal</span>
                                    </Button>
                                )
                            }
                        />
                    )}
                    {/* Logo */}
                    <Link href={"/"}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-sm flex items-center justify-center">
                                <Image className="rounded-sm" src={"/icon.png"} width={40} height={40} alt={""} />
                            </div>
                            <div className="hidden sm:flex flex-col leading-tight">
                                <span className="text-sm text-slate-300 font-bold"> File Manager </span>
                            </div>
                        </div>
                    </Link>
                </div>

                {showTools && (
                    <>
                        {/* Phones: search icon; the bar below covers the header when open */}
                        <button
                            type="button"
                            aria-label="Search"
                            onClick={() => setSearchOpen(true)}
                            className="sm:hidden flex h-11 w-11 items-center justify-center rounded-full text-slate-300 hover:bg-white/10"
                        >
                            <Search className="h-5 w-5" />
                        </button>

                        {searchOpen && (
                            <div className="sm:hidden absolute inset-0 z-10 flex items-center gap-1 bg-slate-950 px-2">
                                <button
                                    type="button"
                                    aria-label="Close search"
                                    onClick={closeSearch}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-white/10"
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                </button>
                                <InputGroup>
                                    <InputGroupInput
                                        autoFocus
                                        type="search"
                                        enterKeyHint="search"
                                        placeholder="Search files..."
                                        value={query || ""}
                                        onChange={(e) => onQueryChange(e.target.value)}
                                        onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                                    />
                                    {query?.trim() && <InputGroupAddon align="inline-end">{resultCount}</InputGroupAddon>}
                                </InputGroup>
                            </div>
                        )}

                        {/* From sm up: search box and buttons in the bar */}
                        <div className="hidden sm:flex w-full max-w-lg gap-3">
                            <InputGroup>
                                <InputGroupInput
                                    placeholder="Search files..."
                                    value={query || ""}
                                    onChange={(e) => onQueryChange(e.target.value)}
                                />
                                <InputGroupAddon>
                                    <Search className="w-4 h-4" />
                                </InputGroupAddon>
                                <InputGroupAddon align="inline-end">{resultCount}</InputGroupAddon>
                            </InputGroup>

                            <div className="flex items-center gap-2">
                                {canUseTerminal && (
                                    <Button
                                        onClick={onOpenTerminal}
                                        variant="outline"
                                        size="icon"
                                        className="border-white/10"
                                    >
                                        <TerminalSquare className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* One instance of each, so drag-and-drop and upload progress are not duplicated;
                            their own buttons show from sm up, the "+" button opens them on phones */}
                        <div className="hidden sm:flex items-center gap-2 sm:-ml-1">
                            <UploadFileManager
                                currentPath={currentPath}
                                onUploaded={onUploaded}
                                open={uploadOpen}
                                onOpenChange={setUploadOpen}
                            />
                            <CreateFolderDialog
                                currentPath="/"
                                onSuccess={onUploaded}
                                open={folderOpen}
                                onOpenChange={setFolderOpen}
                            />
                        </div>
                    </>
                )}
            </header>

            {showTools && (
                // Outside the header: its backdrop-blur would make `fixed` relative to it
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label="Add files or folder"
                            className="sm:hidden fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-black/40 active:bg-red-700"
                        >
                            <Plus className="h-6 w-6" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="top"
                        align="end"
                        className="min-w-[200px] rounded-xl border border-slate-800/80 bg-slate-900/95 py-1 backdrop-blur-md"
                    >
                        <DropdownMenuItem className="min-h-11 gap-3 text-slate-100" onSelect={() => setUploadOpen(true)}>
                            <Upload className="h-4 w-4 text-slate-400" />
                            Upload files
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11 gap-3 text-slate-100" onSelect={() => setFolderOpen(true)}>
                            <FolderPlus className="h-4 w-4 text-slate-400" />
                            New folder
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </>
    );
}
