"use client";

import { Check, Grid2x2, LayoutGrid, List, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/lib/file-manager/useViewMode";

const OPTIONS: Record<ViewMode, { label: string; hint: string; icon: LucideIcon }> = {
    list: { label: "List", hint: "Name, size and date in rows", icon: List },
    grid: { label: "Grid", hint: "Cards with a small preview", icon: LayoutGrid },
    large: { label: "Large", hint: "Big previews, good for photos", icon: Grid2x2 },
};

type ViewModeMenuProps = {
    value: ViewMode;
    onChange: (mode: ViewMode) => void;
};

// One button showing the current layout; the menu switches between them
export function ViewModeMenu({ value, onChange }: ViewModeMenuProps) {
    const Current = OPTIONS[value].icon;

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={`View: ${OPTIONS[value].label}`}
                    className="h-9 w-9 shrink-0"
                >
                    <Current className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="min-w-[220px] rounded-xl border border-slate-800/80 bg-slate-900/95 py-1 backdrop-blur-md"
            >
                <DropdownMenuLabel className="text-xs text-slate-500">View</DropdownMenuLabel>
                {(Object.keys(OPTIONS) as ViewMode[]).map((mode) => {
                    const { label, hint, icon: Icon } = OPTIONS[mode];
                    const selected = mode === value;
                    return (
                        <DropdownMenuItem
                            key={mode}
                            onSelect={() => onChange(mode)}
                            className={cn("min-h-11 gap-3 text-slate-100", selected && "bg-slate-800/60")}
                        >
                            <Icon className="h-4 w-4 text-slate-400" />
                            <span className="flex-1">
                                <span className="block">{label}</span>
                                <span className="block text-[11px] text-slate-500">{hint}</span>
                            </span>
                            {selected && <Check className="h-4 w-4 text-red-400" />}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
