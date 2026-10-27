import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FileAccessError } from "@/lib/security/path-guard";
import { RULE_ROLES, isRuleRole } from "@/lib/security/file-actions";

// Admin-tunable switches for inboxes (upload links), stored in AppSetting

export type InboxSettings = {
    enabled: boolean;       // off = every inbox link answers 404 and nobody can create one
    roles: Role[];          // roles that may create inboxes
    quotaMB: number;        // total received by one user across all inboxes; 0 = no limit
    allowNoExpiry: boolean; // may an inbox be created without an expiry date
};

const KEYS: Record<keyof InboxSettings, string> = {
    enabled: "inbox.enabled",
    roles: "inbox.roles",
    quotaMB: "inbox.quotaMB",
    allowNoExpiry: "inbox.allowNoExpiry",
};

export const INBOX_SETTING_DEFAULTS: InboxSettings = {
    enabled: true,
    roles: ["ADMIN", "USER"],
    quotaMB: 20480,
    allowNoExpiry: true,
};

const MAX_QUOTA_MB = 10 * 1024 * 1024;

function parseRoles(raw: string): Role[] {
    return raw.split(",").map((r) => r.trim()).filter(isRuleRole);
}

export async function getInboxSettings(): Promise<InboxSettings> {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
    const value = (name: keyof InboxSettings) => rows.find((r) => r.key === KEYS[name])?.value;
    const settings = { ...INBOX_SETTING_DEFAULTS };

    const enabled = value("enabled");
    if (enabled !== undefined) settings.enabled = enabled === "1";
    const roles = value("roles");
    if (roles !== undefined) settings.roles = parseRoles(roles);
    const quota = Number(value("quotaMB"));
    if (Number.isInteger(quota) && quota >= 0) settings.quotaMB = quota;
    const noExpiry = value("allowNoExpiry");
    if (noExpiry !== undefined) settings.allowNoExpiry = noExpiry === "1";
    return settings;
}

// Checks a partial update against the stored values; throws before anything is saved
export async function validateInboxSettings(input: Partial<Record<keyof InboxSettings, unknown>>): Promise<InboxSettings> {
    const next = await getInboxSettings();

    if (input.enabled !== undefined) {
        if (typeof input.enabled !== "boolean") throw new FileAccessError("enabled must be true or false", 400);
        next.enabled = input.enabled;
    }
    if (input.allowNoExpiry !== undefined) {
        if (typeof input.allowNoExpiry !== "boolean") throw new FileAccessError("allowNoExpiry must be true or false", 400);
        next.allowNoExpiry = input.allowNoExpiry;
    }
    if (input.roles !== undefined) {
        if (!Array.isArray(input.roles) || !input.roles.every(isRuleRole)) {
            throw new FileAccessError(`roles must be a list of ${RULE_ROLES.join(", ")}`, 400);
        }
        next.roles = [...new Set(input.roles)];
    }
    if (input.quotaMB !== undefined) {
        const quota = input.quotaMB;
        if (typeof quota !== "number" || !Number.isInteger(quota) || quota < 0 || quota > MAX_QUOTA_MB) {
            throw new FileAccessError(`Quota per user (MB) must be a whole number from 0 to ${MAX_QUOTA_MB}`, 400);
        }
        next.quotaMB = quota;
    }
    return next;
}

export async function saveInboxSettings(settings: InboxSettings) {
    const stored: Record<keyof InboxSettings, string> = {
        enabled: settings.enabled ? "1" : "0",
        roles: settings.roles.join(","),
        quotaMB: String(settings.quotaMB),
        allowNoExpiry: settings.allowNoExpiry ? "1" : "0",
    };
    await prisma.$transaction(
        (Object.keys(KEYS) as (keyof InboxSettings)[]).map((name) =>
            prisma.appSetting.upsert({
                where: { key: KEYS[name] },
                create: { key: KEYS[name], value: stored[name] },
                update: { value: stored[name] },
            })
        )
    );
}

export function quotaBytes(settings: InboxSettings): number | null {
    return settings.quotaMB === 0 ? null : settings.quotaMB * 1024 * 1024;
}
