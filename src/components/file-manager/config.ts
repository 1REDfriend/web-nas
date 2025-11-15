import {
    HomeIcon,
    Folder,
    Star,
    Trash2,
    Clock,
} from "lucide-react";

export type FolderId = "all" | "projects" | "media" | "starred" | "recent" | "trash";

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
    { id: "projects", label: "Projects", icon: Folder },
    { id: "media", label: "Media", icon: Folder },
    { id: "starred", label: "Starred", icon: Star },
    { id: "recent", label: "Recent", icon: Clock },
    { id: "trash", label: "Trash", icon: Trash2 },
] as const;

export const FOLDER_PATHS: Record<(typeof FOLDERS)[number]["id"], string | null> = {
    all: null,
    projects: "/projects",
    media: "/media",
    starred: null,
    recent: null,
    trash: "/trash",
};
