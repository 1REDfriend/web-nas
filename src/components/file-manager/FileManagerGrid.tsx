import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { File as FileIcon, Folder, MoreVertical, Star } from "lucide-react";
import { FileItem } from "./config";
import { mediaTypeOf, thumbnailUrl } from "@/lib/file-manager/media";
import { FileAction, isTrashItem } from "@/lib/file-manager/fileActions";
import { formatDate, formatSize } from "@/lib/file-manager/format";
import { longPressStyle, useLongPress } from "@/lib/file-manager/useLongPress";
import { cn } from "@/lib/utils";
import { Thumbnail } from "./Thumbnail";

// Each input keeps its own habits:
//   mouse  click selects, double-click opens, right-click or ⋮ opens a menu at the pointer
//   touch  tap opens (folders) or shows (files), long press or ⋮ opens the action sheet
type FileManagerGridProps = {
    files: FileItem[];
    activeFilePath: string | null;
    listLoading: boolean;
    onSelect: (file: FileItem) => void;
    onOpen: (file: FileItem) => void;
    onTouchTap: (file: FileItem) => void;
    onOpenSheet: (file: FileItem) => void;
    // Items for the right-click and ⋮ menus
    menuActionsFor: (file: FileItem) => FileAction[];
    // No star button when omitted (share pages)
    onToggleStar?: (file: FileItem) => void;
    // Search results come from many folders: show which one each is in
    showLocation?: boolean;
    // Share pages serve thumbnails from their own endpoint and have no trash
    thumbnailSrc?: (file: FileItem) => string;
    isTrash?: (file: FileItem) => boolean;
};

export function FileManagerGrid({
    files,
    activeFilePath,
    listLoading,
    showLocation = false,
    ...handlers
}: FileManagerGridProps) {
    return (
        <ScrollArea className="flex-1 overflow-y-scroll">
            {/* One column of rows on phones, cards from sm up */}
            <div className="p-2 sm:p-4 grid gap-1.5 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {listLoading && !files.length && (
                    <div className="col-span-full flex justify-center py-10 text-sm text-slate-400">
                        Loading file...
                    </div>
                )}

                {!listLoading &&
                    files.map((file) => (
                        <FileTile
                            key={file.path || file.id}
                            file={file}
                            isActive={activeFilePath === file.path}
                            showLocation={showLocation}
                            {...handlers}
                        />
                    ))}

                {!listLoading && !files.length && (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-500">
                        <Folder className="w-10 h-10 mb-3 text-slate-600" />
                        <p className="text-sm font-medium">No files found</p>
                        <p className="text-xs text-slate-500 mt-1">
                            Try changing your search term or selecting a different folder 😄
                        </p>
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

const MENU_CLASS =
    "min-w-[220px] rounded-xl border border-slate-800/80 bg-slate-900/95 backdrop-blur-md shadow-xl shadow-black/40 py-1";

function itemClass(action: FileAction) {
    return cn(
        "flex items-center gap-2 focus:bg-slate-800/80",
        action.destructive ? "text-red-400 focus:text-red-400" : "text-slate-100",
    );
}

function iconClass(action: FileAction) {
    return cn("h-3.5 w-3.5", !action.destructive && "text-slate-400");
}

type FileTileProps = Omit<FileManagerGridProps, "files" | "activeFilePath" | "listLoading" | "showLocation"> & {
    file: FileItem;
    isActive: boolean;
    showLocation: boolean;
};

function FileTile({
    file,
    isActive,
    showLocation,
    onSelect,
    onOpen,
    onTouchTap,
    onOpenSheet,
    menuActionsFor,
    onToggleStar,
    thumbnailSrc = (f) => thumbnailUrl(f.path),
    isTrash = isTrashItem,
}: FileTileProps) {
    const [contextOpen, setContextOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const isDirectory = file.type === "directory";
    const inTrash = isTrash(file);
    const showThumb = !isDirectory && !inTrash && mediaTypeOf(file.name)?.kind === "image";

    const { handlers: press, lastPointer } = useLongPress({
        onTap: (pointer) => (pointer === "touch" || pointer === "pen" ? onTouchTap(file) : onSelect(file)),
        onLongPress: () => onOpenSheet(file),
    });
    const usingTouch = () => lastPointer() === "touch" || lastPointer() === "pen";

    // Built when a menu is about to show, so it reflects the file as it is now
    const actions = contextOpen || dropdownOpen ? menuActionsFor(file) : [];

    const icon = (
        <div className="flex h-full w-full items-center justify-center rounded-lg bg-red-500/15 sm:rounded-none sm:bg-slate-950/40">
            {isDirectory ? (
                <Folder className="h-5 w-5 text-red-400 sm:h-8 sm:w-8" />
            ) : (
                <FileIcon className="h-5 w-5 text-red-200 sm:h-8 sm:w-8" />
            )}
        </div>
    );

    const meta = isDirectory
        ? ["Folder", formatDate(file.updatedAt)]
        : [formatSize(file.size), formatDate(file.updatedAt)];

    return (
        <ContextMenu onOpenChange={setContextOpen}>
            <ContextMenuTrigger asChild>
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={file.name}
                    {...press}
                    onDoubleClick={(e) => {
                        // A double tap is two taps, already handled
                        if (usingTouch()) return;
                        e.stopPropagation();
                        onOpen(file);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            onOpen(file);
                        } else if (e.key === " ") {
                            e.preventDefault();
                            onSelect(file);
                        }
                    }}
                    style={longPressStyle}
                    className={cn(
                        "group relative flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-slate-900/70 p-1.5 transition hover:bg-slate-800/80",
                        "sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:p-0",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60",
                        isActive && "ring-1 ring-red-500/60",
                    )}
                >
                    {/* Preview: small square on phones, a banner on cards */}
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-full sm:rounded-none">
                        {showThumb ? (
                            <Thumbnail src={thumbnailSrc(file)} name={file.name} className="h-full w-full" fallback={icon} />
                        ) : (
                            icon
                        )}
                    </div>

                    <div className="flex min-w-0 flex-1 items-center gap-1 sm:px-3 sm:py-2">
                        <div className="min-w-0 flex-1">
                            <p
                                className="line-clamp-2 break-all text-sm font-medium leading-snug text-slate-100 sm:line-clamp-1"
                                title={file.name}
                            >
                                {file.name}
                            </p>
                            {showLocation && file.folder && (
                                <p className="truncate text-[11px] text-slate-400">in {file.folder}</p>
                            )}
                            {file.available === false ? (
                                <p className="text-[11px] text-amber-400">Offline (disk not found)</p>
                            ) : (
                                <p className="truncate text-[11px] text-slate-500">{meta.filter(Boolean).join(" · ")}</p>
                            )}
                        </div>

                        {!inTrash && onToggleStar && (
                            <button
                                type="button"
                                aria-label={file.isStarred ? "Remove star" : "Add star"}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleStar(file);
                                }}
                                onDoubleClick={(e) => e.stopPropagation()}
                                className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:text-yellow-400"
                            >
                                <Star className={cn("h-4 w-4", file.isStarred && "fill-yellow-400 text-yellow-400")} />
                            </button>
                        )}

                        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen} modal={false}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="More actions"
                                    onPointerDown={(e) => {
                                        // Touch gets the sheet on click instead; this stops Radix opening the menu
                                        if (e.pointerType !== "mouse") e.preventDefault();
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (usingTouch()) onOpenSheet(file);
                                    }}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className={MENU_CLASS}>
                                {actions.map((action, i) => (
                                    <div key={action.id}>
                                        {action.groupStart && i > 0 && <DropdownMenuSeparator className="my-1 bg-slate-800/80" />}
                                        <DropdownMenuItem onSelect={action.run} className={itemClass(action)}>
                                            <action.icon className={iconClass(action)} />
                                            <span>{action.label}</span>
                                        </DropdownMenuItem>
                                    </div>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </ContextMenuTrigger>

            <ContextMenuContent className={MENU_CLASS}>
                {actions.map((action, i) => (
                    <div key={action.id}>
                        {action.groupStart && i > 0 && <ContextMenuSeparator className="my-1 bg-slate-800/80" />}
                        <ContextMenuItem inset onSelect={action.run} className={itemClass(action)}>
                            <action.icon className={iconClass(action)} />
                            <span>{action.label}</span>
                        </ContextMenuItem>
                    </div>
                ))}
            </ContextMenuContent>
        </ContextMenu>
    );
}
