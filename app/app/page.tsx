"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import {
  HomeIcon,
  Search,
  Folder,
  Star,
  Trash2,
  Clock,
  File,
  MoreVertical,
  Upload,
  Plus,
  ListFilter,
  ChevronRight,
  DownloadCloud,
  Settings,
} from "lucide-react";

const FOLDERS = [
  { id: "all", label: "All files", icon: HomeIcon },
  { id: "projects", label: "Projects", icon: Folder },
  { id: "media", label: "Media", icon: Folder },
  { id: "starred", label: "Starred", icon: Star },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "trash", label: "Trash", icon: Trash2 },
];

const MOCK_FILES = [
  {
    id: 1,
    name: "esp32-kline-schematic.pdf",
    type: "PDF",
    size: "2.4 MB",
    updatedAt: "2025-11-01",
    folder: "projects",
  },
  {
    id: 2,
    name: "ecu-simulator-notes.md",
    type: "Markdown",
    size: "34 KB",
    updatedAt: "2025-10-29",
    folder: "projects",
  },
  {
    id: 3,
    name: "demo-dashboard.mp4",
    type: "Video",
    size: "120 MB",
    updatedAt: "2025-10-15",
    folder: "media",
  },
  {
    id: 4,
    name: "requirements.xlsx",
    type: "Sheet",
    size: "410 KB",
    updatedAt: "2025-10-10",
    folder: "projects",
  },
  {
    id: 5,
    name: "old-wire-diagram.png",
    type: "Image",
    size: "800 KB",
    updatedAt: "2025-09-01",
    folder: "trash",
  },
];

export default function Home() {
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [activeFileId, setActiveFileId] = useState<number | null>(
    MOCK_FILES[0]?.id ?? null
  );
  const [query, setQuery] = useState("");

  const filteredFiles = useMemo(() => {
    return MOCK_FILES.filter((file) => {
      const inFolder =
        selectedFolder === "all" ? true : file.folder === selectedFolder;

      const inSearch =
        query.trim().length === 0
          ? true
          : file.name.toLowerCase().includes(query.toLowerCase());

      return inFolder && inSearch;
    });
  }, [selectedFolder, query]);

  const searchCount = filteredFiles.length;

  const activeFile = useMemo(
    () => filteredFiles.find((f) => f.id === activeFileId) ?? filteredFiles[0],
    [filteredFiles, activeFileId]
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      {/* Top bar */}
      <header className="flex items-center justify-between w-full h-16 bg-red-500/5 border-b border-white/10 px-6 md:px-10 backdrop-blur">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
            <span className="font-bold text-red-500 text-2xl">F</span>
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-sm text-slate-300">File Manager</span>
            <span className="text-xs text-slate-500">
              Account Name
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="flex w-full max-w-lg">
          <InputGroup>
            <InputGroupInput
              placeholder="Search files..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <InputGroupAddon>
              <Search className="w-4 h-4" />
            </InputGroupAddon>
            <InputGroupAddon align="inline-end">
              {searchCount} result{searchCount === 1 ? "" : "s"}
            </InputGroupAddon>
          </InputGroup>

          {/* Actions */}
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="outline" size="icon" className="border-white/10">
                <Upload className="w-4 h-4" />
              </Button>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New folder
              </Button>
            </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left sidebar: main navigation */}
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
                    onClick={() => setSelectedFolder(item.id)}
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
                <Button
                variant={"ghost"}
                className="w-full justify-start gap-2"
                >
                  <Settings className="w-4 h-4" />
                    <span>Setting</span>
                </Button>
              </div>
          </div>

          {/* Storage summary */}
          <div className="p-4 mt-auto">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">
              Storage
            </p>
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-red-500/80"
                  style={{ width: "42%" }}
                />
              </div>
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-slate-200">42 GB</span> of
                100 GB used
              </p>
            </div>
          </div>
        </aside>

        {/* Middle & right panels */}
        <section className="flex flex-1 overflow-hidden">
          {/* Middle left: folder tree (simplified) */}
          <div className="hidden lg:flex w-64 border-r border-white/10 flex-col bg-slate-950/40">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-semibold uppercase text-slate-500">
                Folders
              </span>
              <Button variant="ghost" size="icon">
                <ListFilter className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-3 pb-4 space-y-1 text-sm">
                {FOLDERS.filter((f) => f.id !== "all").map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5 ${selectedFolder === folder.id ? "bg-white/10" : ""
                      }`}
                  >
                    <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
                    <Folder className="w-4 h-4 text-slate-400" />
                    <span className="flex-1 text-slate-100">
                      {folder.label}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Center: file list */}
          <div className="flex-1 flex flex-col">
            {/* toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-950/40">
              <div>
                <h2 className="text-sm font-semibold">
                  {FOLDERS.find((f) => f.id === selectedFolder)?.label ??
                    "Files"}
                </h2>
                <p className="text-xs text-slate-500">
                  {filteredFiles.length} item
                  {filteredFiles.length === 1 ? "" : "s"} in this view
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <DownloadCloud className="w-4 h-4" />
                  Download
                </Button>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* file grid */}
            <ScrollArea className="flex-1">
              <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredFiles.map((file) => {
                  const isActive = activeFile?.id === file.id;
                  return (
                    <Card
                      key={file.id}
                      className={`cursor-pointer border-white/10 bg-slate-900/70 hover:bg-slate-800/80 transition ${isActive ? "ring-1 ring-red-500/60" : ""
                        }`}
                      onClick={() => setActiveFileId(file.id)}
                    >
                      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-md bg-red-500/20 flex items-center justify-center">
                            <File className="w-4 h-4 text-red-400" />
                          </div>
                          <div className="flex flex-col">
                            <CardTitle className="text-sm truncate max-w-[160px]">
                              {file.name}
                            </CardTitle>
                            <span className="text-[11px] text-slate-500">
                              {file.type}
                            </span>
                          </div>
                        </div>
                        <MoreVertical className="w-4 h-4 text-slate-500" />
                      </CardHeader>
                      <CardContent className="pt-0 text-xs text-slate-400 space-y-1">
                        <p>Size: {file.size}</p>
                        <p>Updated: {file.updatedAt}</p>
                      </CardContent>
                    </Card>
                  );
                })}

                {filteredFiles.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-500">
                    <Folder className="w-10 h-10 mb-3 text-slate-600" />
                    <p className="text-sm font-medium">No files found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      ลองเปลี่ยนคำค้นหรือเลือกโฟลเดอร์อื่นดูสิ 😄
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: preview panel */}
          <aside className="hidden xl:flex w-80 border-l border-white/10 flex-col bg-slate-950/60">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
                Preview
              </p>
              {activeFile ? (
                <p className="text-sm font-medium truncate">
                  {activeFile.name}
                </p>
              ) : (
                <p className="text-sm text-slate-500">Select a file</p>
              )}
            </div>
            <ScrollArea className="flex-1">
              {activeFile ? (
                <div className="p-4 space-y-4 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <File className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">
                        {activeFile.type} file
                      </span>
                      <span className="text-xs text-slate-400">
                        {activeFile.size}
                      </span>
                    </div>
                  </div>

                  <Separator className="bg-white/5" />

                  <div className="space-y-1 text-xs text-slate-400">
                    <p>
                      <span className="font-semibold text-slate-200">
                        Updated:
                      </span>{" "}
                      {activeFile.updatedAt}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-200">
                        Location:
                      </span>{" "}
                      /{activeFile.folder}
                    </p>
                  </div>

                  <Separator className="bg-white/5" />

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-300">
                      Quick actions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="text-xs">
                        <DownloadCloud className="w-3 h-3 mr-1" />
                        Download
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs">
                        <Star className="w-3 h-3 mr-1" />
                        Star
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs">
                        <Trash2 className="w-3 h-3 mr-1" />
                        Move to trash
                      </Button>
                    </div>
                  </div>

                  <Separator className="bg-white/5" />

                  <p className="text-xs text-slate-500">
                    ตรงนี้ต่อยอดให้ดึง preview จริงได้ เช่นแสดงภาพ, render
                    markdown หรือโค้ด ฯลฯ
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a file</p>
              )}
            </ScrollArea>
          </aside>
        </section>
      </main>
    </div>
  );
}