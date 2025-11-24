import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, Folder as FolderIcon, PlusIcon, Trash2, Pencil } from "lucide-react";
import { FOLDERS } from "./config";
import { useEffect, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { addFolderFavorite } from "@/lib/api/file.service";
import { categoryPath } from "@/interfaces/path";
import { logerror } from "@/lib/logger";

// Import Shadcn Context Menu
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu";

type FileManagerFolderTreeProps = {
    selectedFolder: string;
    onSelectFolder: (folderId: string) => void;
    onDeleteFolder?: (folder: categoryPath) => void;
    onRenameFolder?: (folder: categoryPath) => void;
};

export function FileManagerFolderTree({
    selectedFolder,
    onSelectFolder,
    onDeleteFolder,
    onRenameFolder,
}: FileManagerFolderTreeProps) {
    const [toggleCreate, setToggleCreate] = useState(false)
    const [folderName, setFolderName] = useState("")
    const [categoryPath, setCategoryPath] = useState<categoryPath[]>([])

    const handleToggle = () => {
        setToggleCreate(!toggleCreate)
    }

    const handleEnter = () => {
        if (folderName.trim()) {
            addFolderFavorite(folderName);
            setToggleCreate(false);
            setFolderName("");
        }
    }

    const handleFolderName = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFolderName(event.target?.value)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            handleEnter();
        }
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                const result = await addFolderFavorite();
                if (result && result.categoryPath) {
                    setCategoryPath(result.categoryPath);
                } else {
                    setCategoryPath([]);
                }
            } catch (error) {
                logerror("Error fetching: " + error);
                setCategoryPath([]);
            }
        };
        fetchData();
    }, [])

    return (
        <div className="hidden lg:flex w-64 border-r border-white/10 flex-col bg-slate-950/40">
            <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-semibold uppercase text-slate-500">
                    Folders
                </span>
            </div>
            <ScrollArea className="flex-1">
                <div className="px-3 pb-4 space-y-1 text-sm">
                    {toggleCreate && (
                        <InputGroup >
                            <InputGroupInput placeholder="Add Folder Name..."
                                value={folderName}
                                onChange={handleFolderName}
                                onKeyDown={handleKeyDown}
                                autoFocus
                            />
                            <InputGroupAddon>
                                <FolderIcon />
                            </InputGroupAddon>
                        </InputGroup>
                    )}

                    {/* --- Category Path with Themed Context Menu --- */}
                    {categoryPath && categoryPath.map((folder) => (
                        <ContextMenu key={folder.id}>
                            <ContextMenuTrigger asChild>
                                <button
                                    onClick={() => onSelectFolder(folder.id)}
                                    className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5 ${selectedFolder === folder.id ? "bg-white/10" : ""
                                        }`}
                                >
                                    <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
                                    <FolderIcon className="w-4 h-4 text-slate-400" />
                                    <span className="flex-1 text-slate-100">{folder.rootPath}</span>
                                </button>
                            </ContextMenuTrigger>

                            {/* ใช้ Class เดียวกับ ContextMenuBar ของคุณ */}
                            <ContextMenuContent className="min-w-[220px] rounded-xl border border-slate-800/80 bg-slate-900/95 backdrop-blur-md shadow-xl shadow-black/40 py-1">
                                <ContextMenuItem
                                    inset
                                    onClick={() => onRenameFolder?.(folder)}
                                    className="flex items-center gap-2 text-slate-100 focus:bg-slate-800/80"
                                >
                                    <Pencil className="h-3.5 w-3.5 text-slate-400" />
                                    <span>Rename Folder</span>
                                </ContextMenuItem>

                                <ContextMenuSeparator className="my-1 bg-slate-800/80" />

                                <ContextMenuItem
                                    inset
                                    className="flex items-center gap-2 text-red-400 focus:bg-slate-800/80 focus:text-red-400"
                                    onClick={() => onDeleteFolder?.(folder)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Delete Folder</span>
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    ))}
                    {/* ------------------------------------------- */}

                    {FOLDERS.filter((f) => f.id !== "all").map((folder) => (
                        <button
                            key={folder.id}
                            onClick={() => onSelectFolder(folder.id)}
                            className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5 ${selectedFolder === folder.id ? "bg-white/10" : ""
                                }`}
                        >
                            <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
                            <FolderIcon className="w-4 h-4 text-slate-400" />
                            <span className="flex-1 text-slate-100">{folder.label}</span>
                        </button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}