"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

// One press model for touch, mouse and pen: a short press is a tap, holding still
// for LONG_PRESS_MS is a long press. Desktop gets the same long press as phones,
// and right-click is routed to the same handler so there is one code path.

export const LONG_PRESS_MS = 500;
// Fingers wobble; moving further than this means the user is scrolling or dragging
const MOVE_TOLERANCE_PX = 10;

type LongPressOptions = {
    onTap?: () => void;
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

export function useLongPress({ onTap, onLongPress, disabled = false }: LongPressOptions): LongPressHandlers {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
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
            if (disabled) return;
            // Only the primary button; right-click goes through onContextMenu
            if (e.pointerType === "mouse" && e.button !== 0) return;
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
            if (!disabled) callbacks.current.onTap?.();
        },
        [disabled],
    );

    const onContextMenu = useCallback(
        (e: MouseEvent) => {
            // Also stops the browser's own menu that a touch long press opens on Android
            e.preventDefault();
            e.stopPropagation();
            // A touch long press raises contextmenu too, before or after our timer:
            // whichever comes first opens, the other is ignored
            if (disabled || fired.current) return;
            clear();
            fired.current = true;
            callbacks.current.onLongPress();
        },
        [clear, disabled],
    );

    return {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: clear,
        onPointerLeave: clear,
        onClick,
        onContextMenu,
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
