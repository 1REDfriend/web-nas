// Shared between client and server: keep this file free of Node-only imports.

export const FILE_ACTIONS = [
    "VIEW",
    "DOWNLOAD",
    "UPLOAD",
    "RENAME",
    "MOVE",
    "DELETE",
    "SHARE",
] as const;

export type FileAction = (typeof FILE_ACTIONS)[number];

export const FILE_ACTION_LABELS: Record<FileAction, string> = {
    VIEW: "View / list",
    DOWNLOAD: "Download / copy from",
    UPLOAD: "Upload / create / paste into",
    RENAME: "Rename",
    MOVE: "Move (cut)",
    DELETE: "Delete",
    SHARE: "Share link",
};

export const RULE_ROLES = ["ADMIN", "USER", "GUEST"] as const;

export type RuleRole = (typeof RULE_ROLES)[number];

// Actions that remove or relocate the entry itself (as opposed to its content)
export const DESTRUCTIVE_ACTIONS: readonly FileAction[] = ["RENAME", "MOVE", "DELETE"];

export function isFileAction(value: unknown): value is FileAction {
    return typeof value === "string" && (FILE_ACTIONS as readonly string[]).includes(value);
}

export function isRuleRole(value: unknown): value is RuleRole {
    return typeof value === "string" && (RULE_ROLES as readonly string[]).includes(value);
}

export function parseActions(raw: string): FileAction[] {
    return raw
        .split(",")
        .map((a) => a.trim())
        .filter(isFileAction);
}

export function serializeActions(actions: readonly FileAction[]): string {
    return FILE_ACTIONS.filter((a) => actions.includes(a)).join(",");
}
