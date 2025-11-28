import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FOLDERS } from "./config";
import { RootPathSettingsDialog } from "./RootPathSettingsDialog";
import { useEffect, useState } from "react";
import { fetchStorage } from "@/lib/api/system/storage.service";
import prettyBytes from "pretty-bytes";

type FileManagerSidebarNavProps = {
    selectedFolder: string;
    onSelectFolder: (folderId: string) => void;
};

export function FileManagerSidebarNav({
    selectedFolder,
    onSelectFolder,
}: FileManagerSidebarNavProps) {
    const [total, setTotal] = useState(0);
    const [free, setFree] = useState(0);
    const [used, setUsed] = useState(0);
    const [loading, setLoading] = useState(true);

    const usagePercent = total > 0 ? (used / total) * 100 : 0;

    let progressColor = "bg-emerald-500/80";
    if (usagePercent > 75) progressColor = "bg-yellow-500/80";
    if (usagePercent > 90) progressColor = "bg-red-500/80";

    useEffect(() => {
        const storage = async () => {
            try {
                const data = await fetchStorage();
                if (data) {
                    setTotal(data.total);
                    setFree(data.free);
                    setUsed(data.used);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        }
        storage()
    }, [])

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
                        <div
                            className={`h-full transition-all duration-500 ${progressColor}`}
                            style={{ width: `${usagePercent}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-200">
                            {prettyBytes(used)}
                        </span>{" "}
                        of {prettyBytes(total)} used
                    </p>
                </div>
            </div>
        </aside>
    );
}
