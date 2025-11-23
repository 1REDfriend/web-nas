import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Trash2, Folder } from "lucide-react";

export function FolderItem({ name }: { name: string }) {
    return (
        <ContextMenu>
            {/* ส่วนที่เป็นตัว Folder (Trigger) */}
            <ContextMenuTrigger className="flex items-center gap-2 p-2 hover:bg-slate-800/50 rounded cursor-pointer select-none">
                <Folder className="w-5 h-5 text-yellow-500" />
                <span>{name}</span>
            </ContextMenuTrigger>

            {/* เมนูที่จะขึ้นเฉพาะตอนคลิกขวาที่ Folder นี้ */}
            <ContextMenuContent className="w-48">
                <ContextMenuItem className="text-red-500 focus:text-red-500 focus:bg-red-100/10">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Folder
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}