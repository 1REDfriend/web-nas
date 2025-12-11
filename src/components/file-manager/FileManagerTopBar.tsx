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
import Image from "next/image";

type FileManagerTopBarProps = {
    query?: string;
    searchCount?: number;
    onQueryChange?: (value: string) => void;
    onOpenTerminal?: () => void;
    currentPath?: string;
    onUploaded?: () => void;
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
                    <div className="w-12 h-12 bg-white/10 rounded-sm flex items-center justify-center" >
                        <Image className="rounded-sm" src={"/icon.png"} width={40} height={40} alt={""} />
                    </div>
                    < div className="hidden sm:flex flex-col leading-tight" >
                        <span className="text-sm text-slate-300 font-bold" > File Manager </span>
                    </div>
                </div>
            </Link>

            {(currentPath && onUploaded && onQueryChange && onOpenTerminal) && (
                <div className="flex w-full max-w-lg gap-3">
                    {/* Search */}
                    <InputGroup>
                        <InputGroupInput
                            placeholder="Search files..."
                            value={query || ""}
                            onChange={(e) => onQueryChange(e.target.value)}
                        />
                        <InputGroupAddon>
                            <Search className="w-4 h-4" />
                        </InputGroupAddon>

                        {/* แสดงผลลัพธ์เฉพาะเมื่อ searchCount เป็นตัวเลข (รวม 0) */}
                        <InputGroupAddon align="inline-end" className="max-sm:hidden">
                            {typeof searchCount === 'number' ? searchCount : 0} result{searchCount === 1 ? "" : "s"}
                        </InputGroupAddon>
                    </InputGroup>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={onOpenTerminal}
                            variant="outline"
                            size="icon"
                            className="border-white/10"
                        >
                            <TerminalSquare className="w-4 h-4" />
                        </Button>
                        <UploadFileManager currentPath={currentPath} onUploaded={onUploaded} />
                        <CreateFolderDialog currentPath="/" />
                    </div>
                </div>
            )}
        </header >
    );
}
