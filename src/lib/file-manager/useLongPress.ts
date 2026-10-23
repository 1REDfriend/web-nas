"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

// Touch and pen get a phone-style press: a short press is a tap, holding still
// for LONG_PRESS_MS is a long press. A mouse keeps the desktop habits (click,
// double-click, right-click menu), so this hook only reports which kind of
// pointer made each click and leaves mouse right-clicks alone.

export const LONG_PRESS_MS = 500;
// Fingers wobble; moving further than this means the user is scrolling or dragging
const MOVE_TOLERANCE_PX = 10;

// "" when there was no pointer, e.g. a click raised from the keyboard
export type PointerKind = "mouse" | "touch" | "pen" | "";

type LongPressOptions = {
    onTap?: (pointer: PointerKind) => void;
    // Touch and pen only
    onLongPress: () => void;
    disabled?: boolean;
};

export type LongPressHandlers = {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: () => void;
    onPointerLeave: () => void;
    onClick: (e: MouseEvent) => void;
    onContextMenu: (e: MouseEvent) => void;
};

export function useLongPress({ onTap, onLongPress, disabled = false }: LongPressOptions): {
    handlers: LongPressHandlers;
    // The pointer behind the latest press, for handlers this hook does not own (e.g. double-click)
    lastPointer: () => PointerKind;
} {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const pointer = useRef<PointerKind>("");
    // Set when the long press fired, so the click that follows the release is ignored
    const fired = useRef(false);

    // Keep the latest callbacks without restarting a press in progress
    const callbacks = useRef({ onTap, onLongPress });
    useEffect(() => {
        callbacks.current = { onTap, onLongPress };
    });

    const clear = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        start.current = null;
    }, []);

    useEffect(() => clear, [clear]);

    const onPointerDown = useCallback(
        (e: PointerEvent) => {
            fired.current = false;
            pointer.current = (e.pointerType as PointerKind) || "";
            if (disabled || e.pointerType === "mouse") return;
            // Radix context menus higher up open on a touch long press of their own;
            // they skip events already marked handled. Does not stop click or scrolling.
            e.preventDefault();
            start.current = { x: e.clientX, y: e.clientY };
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                timer.current = null;
                start.current = null;
                fired.current = true;
                navigator.vibrate?.(15);
                callbacks.current.onLongPress();
            }, LONG_PRESS_MS);
        },
        [disabled],
    );

    const onPointerMove = useCallback(
        (e: PointerEvent) => {
            if (!start.current) return;
            const dx = e.clientX - start.current.x;
            const dy = e.clientY - start.current.y;
            if (dx * dx + dy * dy > MOVE_TOLERANCE_PX * MOVE_TOLERANCE_PX) clear();
        },
        [clear],
    );

    const onPointerUp = useCallback(() => clear(), [clear]);

    const onClick = useCallback(
        (e: MouseEvent) => {
            if (fired.current) {
                fired.current = false;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            // A click with no pointerdown before it came from the keyboard
            if (e.detail === 0) pointer.current = "";
            if (!disabled) callbacks.current.onTap?.(pointer.current);
        },
        [disabled],
    );

    const onContextMenu = useCallback(
        (e: MouseEvent) => {
            // Right-click and the keyboard menu key belong to the desktop context menu
            if (pointer.current === "mouse" || pointer.current === "") return;
            // A touch long press raises contextmenu too, before or after our timer:
            // whichever comes first opens, the other is ignored. Marking it handled
            // also keeps the browser's and Radix's menus shut.
            e.preventDefault();
            if (disabled || fired.current) return;
            clear();
            fired.current = true;
            callbacks.current.onLongPress();
        },
        [clear, disabled],
    );

    const lastPointer = useCallback(() => pointer.current, []);

    return {
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: clear,
            onPointerLeave: clear,
            onClick,
            onContextMenu,
        },
        lastPointer,
    };
}

// Spread on the pressable element: stops iOS's link/image callout and text
// selection from fighting the long press
export const longPressStyle = {
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    touchAction: "manipulation",
} as const;
