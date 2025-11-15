import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings } from "lucide-react";
import { FOLDERS, FolderId } from "./config";
import { RootPathSettingsDialog } from "./RootPathSettingsDialog";

type FileManagerSidebarNavProps = {
    selectedFolder: FolderId;
    onSelectFolder: (folderId: FolderId) => void;
};

export function FileManagerSidebarNav({
    selectedFolder,
    onSelectFolder,
}: FileManagerSidebarNavProps) {
    return (
        <aside className="hidden md:flex flex-col w-60 border-r border-white/10 bg-slate-950/60">
            <div className="p-4">
                <p className="text-xs font-semibold uppercase text-slate-500 mb-2">
                    Navigation
                </p>
                <div className="space-y-1">
                    {FOLDERS.map((item) => {
                        const Icon = item.icon;
                        const isActive = selectedFolder === item.id;
                        return (
                            <Button
                                key={item.id}
                                variant={isActive ? "secondary" : "ghost"}
                                className="w-full justify-start gap-2"
                                onClick={() => onSelectFolder(item.id)}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{item.label}</span>
                            </Button>
                        );
                    })}
                </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Setting */}
            <div className="p-4 mb-auto">
                <p className="text-xs font-semibold uppercase text-slate-500 mb-2">
                    Setting
                </p>
                <div className="space-y-1">
                    {/* ใช้ component popup แทนปุ่มเดิม */}
                    <RootPathSettingsDialog />
                </div>
            </div>

            {/* Storage summary (mock) */}
            <div className="p-4 mt-auto">
                <p className="text-xs font-semibold uppercase text-slate-500 mb-2">
                    Storage
                </p>
                <div className="space-y-2">
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-red-500/80" style={{ width: "42%" }} />
                    </div>
                    <p className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-200">42 GB</span> of 100
                        GB used
                    </p>
                </div>
            </div>
        </aside>
    );
}
