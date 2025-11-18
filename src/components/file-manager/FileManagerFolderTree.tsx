import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListFilter, ChevronRight, Folder as FolderIcon, PlusIcon } from "lucide-react";
import { FOLDERS, FolderId } from "./config";
import { useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";

type FileManagerFolderTreeProps = {
    selectedFolder: FolderId;
    onSelectFolder: (folderId: FolderId) => void;
};

export function FileManagerFolderTree({
    selectedFolder,
    onSelectFolder,
}: FileManagerFolderTreeProps) {
    const [toggleCreate, setToggleCreate] = useState(false)

    const handleToggle = () => {
        setToggleCreate(!toggleCreate)
    }

    const handleEnther = () => {
        setToggleCreate(false)
        
    }

    return (
        <div className="hidden lg:flex w-64 border-r border-white/10 flex-col bg-slate-950/40">
            <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-semibold uppercase text-slate-500">
                    Folders
                </span>
                <Button onClick={handleToggle} className="bg-white/5 rounded-md active:scale-90 duration-150 ease-in-out" variant="ghost" size="icon">
                    <PlusIcon className=" w-5 h-5" />
                </Button>
            </div>
            <ScrollArea className="flex-1">
                <div className="px-3 pb-4 space-y-1 text-sm">
                    {toggleCreate && (
                        <InputGroup>
                            <InputGroupInput placeholder="Add Folder Name..." />
                            <InputGroupAddon>
                                <FolderIcon />
                            </InputGroupAddon>
                        </InputGroup>
                    )}
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
