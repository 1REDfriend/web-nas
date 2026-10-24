import ptb from "pretty-bytes";

// Display helpers shared by the grid, the details view and the action sheet

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// "23 Oct 2026, 17:41" in the viewer's locale; the raw value if it is not a date
export function formatDate(value: string | undefined | null): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

// Size of a file, or null for folders and missing/invalid sizes.
// binary: powers of 1024 ("10 GiB"), for limits that are set in 1024-based units
export function formatSize(size: string | number | undefined | null, binary = false): string | null {
    if (size == null || size === "") return null;
    const n = Number(size);
    return Number.isNaN(n) ? null : ptb(n, { binary });
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

// "in 12 minutes", "in 5 hours", "in 3 days" until `until`, seen from `now`
export function formatTimeLeft(until: string, now: number): string {
    const minutes = Math.max(0, Math.round((new Date(until).getTime() - now) / 60000));
    if (minutes < 60) return relative.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 48) return relative.format(hours, "hour");
    return relative.format(Math.round(hours / 24), "day");
}
