import { Button } from "@/components/ui/button";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Search, TerminalSquare } from "lucide-react";
import { CreateFolderDialog } from "./CreateFolderDialog";
import Link from "next/link";
import { UploadFileManager } from "./UploadFileManager";

type FileManagerTopBarProps = {
    query: string;
    searchCount: number;
    onQueryChange: (value: string) => void;
    onOpenTerminal?: () => void;
    currentPath: string;
    onUploaded: () => void;
};

export function FileManagerTopBar({
    query,
    searchCount,
    currentPath,
    onUploaded,
    onQueryChange,
    onOpenTerminal,
}: FileManagerTopBarProps) {
    return (
        <header className="flex z-9999 items-center justify-between w-full min-h-16 bg-red-500/5 border-b border-white/10 px-6 md:px-10 backdrop-blur" >
            {/* Logo */}
            <Link href={"/"}>
                < div className="flex items-center gap-3" >
                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center" >
                        <span className="font-bold text-red-500 text-2xl" > F </span>
                    </div>
                    < div className="hidden sm:flex flex-col leading-tight" >
                        <span className="text-sm text-slate-300" > File Manager </span>
                        <span className="text-xs text-slate-500" > Account Name </span>
                    </div>
                </div>
            </Link>


            {/* Search */}
            <div className="flex w-full max-w-lg gap-3" >
                <InputGroup>
                    <InputGroupInput
                        placeholder="Search files..."
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)
                        }
                    />
                    < InputGroupAddon >
                        <Search className="w-4 h-4" />
                    </InputGroupAddon>
                    < InputGroupAddon align="inline-end" className="max-sm:hidden" >
                        {searchCount} result{searchCount === 1 ? "" : "s"}
                    </InputGroupAddon>
                </InputGroup>

                {/* Actions (ยังไม่ได้ผูก API upload / create folder ให้) */}
                <div className="flex items-center gap-2" >
                    <Button
                        onClick={onOpenTerminal}
                        variant="outline" size="icon" className="border-white/10"
                    >
                        <TerminalSquare className="w-4 h-4" />
                    </Button>
                    <UploadFileManager currentPath={currentPath} onUploaded={onUploaded}/>
                    <CreateFolderDialog currentPath="/" />
                </div>
            </div>
        </header>
    );
}
