import type { LucideIcon } from "lucide-react";
import { ArchiveRestore, Copy, DownloadCloud, Pencil, Scissors, Share2, Star, StarOff, Trash2 } from "lucide-react";
import type { FileItem } from "@/components/file-manager/config";

// The one list of things a user can do to a file. The grid menu, the preview
// panel and the mobile action sheet all read from here, so a new action or a
// changed rule (e.g. what trash items allow) is written once.

export type FileActionId =
    | "download"
    | "star"
    | "share"
    | "rename"
    | "copy"
    | "cut"
    | "restore"
    | "delete";

export type FileActionHandlers = Partial<Record<FileActionId, (file: FileItem) => void>>;

export type FileAction = {
    id: FileActionId;
    label: string;
    icon: LucideIcon;
    destructive?: boolean;
    // Draw a divider above this action in menus
    groupStart?: boolean;
    run: () => void;
};

export function isTrashItem(file: Pick<FileItem, "path">): boolean {
    return /^\/?trash\//.test(file.path);
}

type ActionSpec = Omit<FileAction, "run">;

function specsFor(file: FileItem): ActionSpec[] {
    // Trash items can only be restored or deleted for good
    if (isTrashItem(file)) {
        return [
            { id: "restore", label: "Restore", icon: ArchiveRestore },
            { id: "delete", label: "Delete permanently", icon: Trash2, destructive: true, groupStart: true },
        ];
    }

    return [
        { id: "download", label: "Download", icon: DownloadCloud },
        file.isStarred
            ? { id: "star", label: "Remove star", icon: StarOff }
            : { id: "star", label: "Add star", icon: Star },
        { id: "share", label: "Share", icon: Share2 },
        { id: "rename", label: "Rename", icon: Pencil, groupStart: true },
        { id: "copy", label: "Copy", icon: Copy },
        { id: "cut", label: "Cut", icon: Scissors },
        { id: "delete", label: "Move to trash", icon: Trash2, destructive: true, groupStart: true },
    ];
}

// Actions available for `file`, in menu order. An action is left out when no
// handler is given for it, or when `only` is set and does not name it.
export function getFileActions(
    file: FileItem,
    handlers: FileActionHandlers,
    only?: readonly FileActionId[],
): FileAction[] {
    return specsFor(file)
        .filter((spec) => handlers[spec.id] && (!only || only.includes(spec.id)))
        .map((spec) => ({ ...spec, run: () => handlers[spec.id]!(file) }));
}
