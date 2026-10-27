import path from "path";

// Names typed by people sending files through a drop request: shown to the owner
// and used as the drop's download name, so they are kept short and plain.

const NAME_MAX = 200;
const SENDER_MAX = 60;
// Characters Windows cannot store, path separators and control characters
const UNSAFE_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

function trimEdges(name: string): string {
    // Leading dots would hide the file (or make ".."); trailing dots and spaces break on Windows
    return name.replace(/^[\s.]+/, "").replace(/[\s.]+$/, "");
}

function cut(name: string, max: number): string {
    return Array.from(name).slice(0, max).join("");
}

// One safe file name from whatever the browser sent ("dir/a.txt", "..", "<script>.pdf")
export function cleanFileName(raw: string | null | undefined): string {
    const base = path.posix.basename((raw ?? "").replace(/\\/g, "/"));
    let name = trimEdges(base.normalize("NFC").replace(UNSAFE_CHARS, "_"));
    if (!name) return "file";

    if (Array.from(name).length > NAME_MAX) {
        const ext = path.extname(name);
        name = Array.from(ext).length < 20
            ? cut(name.slice(0, name.length - ext.length), NAME_MAX - Array.from(ext).length) + ext
            : cut(name, NAME_MAX);
    }
    return name;
}

// Sender name as typed, for showing; null when blank
export function cleanSenderName(raw: string | null | undefined): string | null {
    const name = cut((raw ?? "").normalize("NFC").replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim(), SENDER_MAX);
    return name || null;
}

// ".PDF, docx ,.zip" -> ["pdf", "docx", "zip"]; empty -> null (anything is accepted)
export function parseExtensions(raw: string | null | undefined): string[] | null {
    const list = (raw ?? "")
        .split(/[\s,]+/)
        .map((e) => e.replace(/^\.+/, "").toLowerCase())
        .filter(Boolean);
    return list.length ? [...new Set(list)] : null;
}

export function extensionAllowed(name: string, allowed: string | null): boolean {
    const list = parseExtensions(allowed);
    if (!list) return true;
    const ext = path.extname(name).replace(/^\./, "").toLowerCase();
    return ext !== "" && list.includes(ext);
}
