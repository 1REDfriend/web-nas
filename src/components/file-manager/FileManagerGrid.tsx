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
import { mediaTypeOf, thumbnailUrl, type ThumbSize } from "@/lib/file-manager/media";
import { FileAction, isTrashItem } from "@/lib/file-manager/fileActions";
import { formatDate, formatSize } from "@/lib/file-manager/format";
import { longPressStyle, useLongPress } from "@/lib/file-manager/useLongPress";
import type { ViewMode } from "@/lib/file-manager/useViewMode";
import { cn } from "@/lib/utils";
import { Thumbnail } from "./Thumbnail";

// Classes for each View choice. "list" is rows (with Size/Modified columns from
// sm up), "grid" is cards with a small preview, "large" is big previews.
const LAYOUTS: Record<ViewMode, {
    container: string;
    tile: string;
    preview: string;
    iconBox: string;
    icon: string;
    body: string;
    name: string;
    star: string;
    thumb: ThumbSize;
}> = {
    list: {
        container: "flex flex-col gap-1",
        tile: "flex items-center gap-3 p-1.5 sm:py-1",
        preview: "h-12 w-12 rounded-lg sm:h-9 sm:w-9 sm:rounded-md",
        iconBox: "rounded-lg bg-red-500/15",
        icon: "h-5 w-5 sm:h-4 sm:w-4",
        body: "flex min-w-0 flex-1 items-center gap-1 sm:gap-3",
        name: "line-clamp-2 sm:line-clamp-1",
        star: "flex",
        thumb: "small",
    },
    grid: {
        container: "grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-4",
        tile: "flex flex-col overflow-hidden",
        preview: "h-24 w-full sm:h-28",
        iconBox: "bg-slate-950/40",
        icon: "h-8 w-8",
        body: "flex min-w-0 flex-1 items-center gap-1 py-1.5 pl-3 pr-1",
        name: "line-clamp-1",
        // Two cards per row on phones leave no room; the star is in the action sheet
        star: "hidden sm:flex",
        thumb: "small",
    },
    large: {
        container: "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
        tile: "flex flex-col overflow-hidden",
        preview: "aspect-[4/3] w-full",
        iconBox: "bg-slate-950/40",
        icon: "h-12 w-12",
        body: "flex min-w-0 flex-1 items-center gap-1 py-1.5 pl-3 pr-1",
        name: "line-clamp-1",
        star: "flex",
        thumb: "large",
    },
};

// Each input keeps its own habits:
//   mouse  click selects, double-click opens, right-click or ⋮ opens a menu at the pointer
//   touch  tap opens (folders) or shows (files), long press or ⋮ opens the action sheet
type FileManagerGridProps = {
    view: ViewMode;
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
    thumbnailSrc?: (file: FileItem, size: ThumbSize) => string;
    isTrash?: (file: FileItem) => boolean;
};

export function FileManagerGrid({
    view,
    files,
    activeFilePath,
    listLoading,
    showLocation = false,
    ...handlers
}: FileManagerGridProps) {
    return (
        <ScrollArea className="flex-1 overflow-y-scroll">
            {/* Bottom room so the "+" button and the paste bar never cover the last item */}
            <div className={cn("p-2 pb-24 sm:p-4 sm:pb-16", LAYOUTS[view].container)}>
                {/* Column titles for the list view, lined up with the tiles below */}
                {view === "list" && !listLoading && files.length > 0 && (
                    <div className="hidden sm:flex items-center gap-3 px-[7px] pb-1 text-[11px] font-semibold uppercase text-slate-500">
                        <span className="w-9 shrink-0" />
                        <span className="min-w-0 flex-1">Name</span>
                        <span className="w-24 shrink-0 text-right">Size</span>
                        <span className="w-44 shrink-0">Modified</span>
                        <span className="w-[4.5rem] shrink-0" />
                    </div>
                )}

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
                            view={view}
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
    view,
    file,
    isActive,
    showLocation,
    onSelect,
    onOpen,
    onTouchTap,
    onOpenSheet,
    menuActionsFor,
    onToggleStar,
    thumbnailSrc = (f, size) => thumbnailUrl(f.path, size),
    isTrash = isTrashItem,
}: FileTileProps) {
    const [contextOpen, setContextOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const isDirectory = file.type === "directory";
    const inTrash = isTrash(file);
    const showThumb = !isDirectory && !inTrash && mediaTypeOf(file.name)?.kind === "image";
    const layout = LAYOUTS[view];
    const isList = view === "list";

    const { handlers: press, lastPointer } = useLongPress({
        onTap: (pointer) => (pointer === "touch" || pointer === "pen" ? onTouchTap(file) : onSelect(file)),
        onLongPress: () => onOpenSheet(file),
    });
    const usingTouch = () => lastPointer() === "touch" || lastPointer() === "pen";

    // Built when a menu is about to show, so it reflects the file as it is now
    const actions = contextOpen || dropdownOpen ? menuActionsFor(file) : [];

    const icon = (
        <div className={cn("flex h-full w-full items-center justify-center", layout.iconBox)}>
            {isDirectory ? (
                <Folder className={cn("text-red-400", layout.icon)} />
            ) : (
                <FileIcon className={cn("text-red-200", layout.icon)} />
            )}
        </div>
    );

    const size = isDirectory ? null : formatSize(file.size);
    const date = formatDate(file.updatedAt);
    const meta = isDirectory ? ["Folder", date] : [size, date];

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
                        "group relative cursor-pointer rounded-xl border border-white/10 bg-slate-900/70 transition hover:bg-slate-800/80",
                        layout.tile,
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60",
                        isActive && "ring-1 ring-red-500/60",
                    )}
                >
                    <div className={cn("shrink-0 overflow-hidden", layout.preview)}>
                        {showThumb ? (
                            <Thumbnail src={thumbnailSrc(file, layout.thumb)} name={file.name} className="h-full w-full" fallback={icon} />
                        ) : (
                            icon
                        )}
                    </div>

                    <div className={layout.body}>
                        <div className="min-w-0 flex-1">
                            <p
                                className={cn("break-all text-sm font-medium leading-snug text-slate-100", layout.name)}
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
                                // The list view shows these in their own columns from sm up
                                <p className={cn("truncate text-[11px] text-slate-500", isList && "sm:hidden")}>
                                    {meta.filter(Boolean).join(" · ")}
                                </p>
                            )}
                        </div>

                        {isList && (
                            <>
                                <span className="hidden sm:block w-24 shrink-0 text-right text-xs text-slate-400">{size ?? "—"}</span>
                                <span className="hidden sm:block w-44 shrink-0 truncate text-xs text-slate-400">{date}</span>
                            </>
                        )}

                        {!inTrash && onToggleStar ? (
                            <button
                                type="button"
                                aria-label={file.isStarred ? "Remove star" : "Add star"}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleStar(file);
                                }}
                                onDoubleClick={(e) => e.stopPropagation()}
                                className={cn(
                                    "h-11 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:text-yellow-400",
                                    layout.star,
                                )}
                            >
                                <Star className={cn("h-4 w-4", file.isStarred && "fill-yellow-400 text-yellow-400")} />
                            </button>
                        ) : (
                            // Keeps the list columns lined up with the header when there is no star
                            isList && <span className="hidden sm:block w-9 shrink-0" />
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
                                    className={cn(
                                        "flex w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100",
                                        isList ? "h-11 sm:h-9" : "h-11",
                                    )}
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
