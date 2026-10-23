"use client";

import { useCallback, useSyncExternalStore } from "react";

// How the file list is laid out, like Explorer's View menu. The choice is kept
// per browser; until one is made, phones get "list" and wider screens "grid".

export type ViewMode = "list" | "grid" | "large";

export const VIEW_MODES: readonly ViewMode[] = ["list", "grid", "large"];

const STORAGE_KEY = "web-nas:view-mode";
const WIDE_QUERY = "(min-width: 640px)";

const listeners = new Set<() => void>();
// Fallback when localStorage cannot be written (private mode, blocked site data)
let memoryChoice: ViewMode | null = null;

function readStored(): ViewMode | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return VIEW_MODES.includes(value as ViewMode) ? (value as ViewMode) : null;
    } catch {
        // Storage blocked (private mode, disabled site data): fall back to the default
        return null;
    }
}

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    // Another tab changed it, or the window crossed the phone/wide boundary
    window.addEventListener("storage", onChange);
    const media = window.matchMedia(WIDE_QUERY);
    media.addEventListener("change", onChange);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onChange);
        media.removeEventListener("change", onChange);
    };
}

function getSnapshot(): ViewMode {
    return readStored() ?? memoryChoice ?? (window.matchMedia(WIDE_QUERY).matches ? "grid" : "list");
}

// The server cannot know the screen; the first client render corrects it
function getServerSnapshot(): ViewMode {
    return "list";
}

export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
    const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const setMode = useCallback((next: ViewMode) => {
        memoryChoice = next;
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Not saved for next time, but memoryChoice applies it for this visit
        }
        listeners.forEach((l) => l());
    }, []);

    return [mode, setMode];
}
