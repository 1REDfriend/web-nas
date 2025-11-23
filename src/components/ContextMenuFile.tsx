import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { FileCode, Copy, Scissors } from "lucide-react";

export function FileItem({ name }: { name: string }) {
    return (
        <ContextMenu>
            <ContextMenuTrigger className="flex items-center gap-2 p-2 hover:bg-slate-800/50 rounded cursor-pointer select-none">
                <FileCode className="w-5 h-5 text-blue-400" />
                <span>{name}</span>
            </ContextMenuTrigger>

            <ContextMenuContent className="w-48">
                <ContextMenuItem>
                    <Copy className="mr-2 h-4 w-4" /> Copy
                </ContextMenuItem>
                <ContextMenuItem>
                    <Scissors className="mr-2 h-4 w-4" /> Cut
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className="text-red-500">
                    Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}