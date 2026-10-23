import ptb from "pretty-bytes";

// Display helpers shared by the grid, the details view and the action sheet

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// "23 Oct 2026, 17:41" in the viewer's locale; the raw value if it is not a date
export function formatDate(value: string | undefined | null): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

// Size of a file, or null for folders and missing/invalid sizes
export function formatSize(size: string | number | undefined | null): string | null {
    if (size == null || size === "") return null;
    const n = Number(size);
    return Number.isNaN(n) ? null : ptb(n);
}
