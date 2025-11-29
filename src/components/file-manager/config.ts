import {
    HomeIcon,
    Star,
    Trash2,
    Clock,
} from "lucide-react";

export type FileItem = {
    id?: string | number;
    name: string;
    path: string;
    type?: string;
    size?: string | number;
    updatedAt?: string;
    folder?: string;
    isStarred?: boolean;
};

export type FileListMeta = {
    totalFiles: number;
    currentPage: number;
    itemsPerPage: number;
    sortBy?: string;
    order?: "asc" | "desc";
};

export const FOLDERS = [
    { id: "all", label: "All files", icon: HomeIcon },
    { id: "starred", label: "Starred", icon: Star },
    { id: "recent", label: "Recent", icon: Clock },
    { id: "trash", label: "Trash", icon: Trash2 },
] as const;

export const FOLDER_PATHS: Record<(typeof FOLDERS)[number]["id"], string | null> = {
    all: null,
    starred: null,
    recent: null,
    trash: "/trash",
};
