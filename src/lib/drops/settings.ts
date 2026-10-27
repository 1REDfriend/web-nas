import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FileAccessError } from "@/lib/security/path-guard";
import { RULE_ROLES, isRuleRole } from "@/lib/security/file-actions";

// Admin-tunable limits for drops and drop requests, stored in AppSetting

export type DropLimits = {
    defaultHours: number;   // lifetime when the uploader does not pick one
    maxHours: number;       // longest lifetime anyone may pick
    quotaMB: number;        // total size of one user's live drops; 0 = no limit
};

const KEYS: Record<keyof DropLimits, string> = {
    defaultHours: "drops.defaultHours",
    maxHours: "drops.maxHours",
    quotaMB: "drops.quotaMB",
};

export const DROP_LIMIT_DEFAULTS: DropLimits = { defaultHours: 24, maxHours: 168, quotaMB: 10240 };

const MAX_HOURS = 24 * 365;
const MAX_QUOTA_MB = 10 * 1024 * 1024;

export async function getDropLimits(): Promise<DropLimits> {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
    const limits = { ...DROP_LIMIT_DEFAULTS };

    for (const name of Object.keys(KEYS) as (keyof DropLimits)[]) {
        const value = Number(rows.find((r) => r.key === KEYS[name])?.value);
        if (Number.isInteger(value)) limits[name] = value;
    }
    // A stored default above a later-lowered maximum is clamped instead of rejected
    limits.defaultHours = Math.min(limits.defaultHours, limits.maxHours);
    return limits;
}

function wholeNumber(value: unknown, label: string, min: number, max: number): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
        throw new FileAccessError(`${label} must be a whole number from ${min} to ${max}`, 400);
    }
    return value;
}

// Checks a partial update against the stored values; throws before anything is saved
export async function validateDropLimits(input: Partial<Record<keyof DropLimits, unknown>>): Promise<DropLimits> {
    const next = await getDropLimits();

    if (input.maxHours !== undefined) next.maxHours = wholeNumber(input.maxHours, "Longest lifetime (hours)", 1, MAX_HOURS);
    if (input.defaultHours !== undefined) next.defaultHours = wholeNumber(input.defaultHours, "Default lifetime (hours)", 1, MAX_HOURS);
    if (input.quotaMB !== undefined) next.quotaMB = wholeNumber(input.quotaMB, "Quota per user (MB)", 0, MAX_QUOTA_MB);

    if (next.defaultHours > next.maxHours) {
        throw new FileAccessError("Default lifetime cannot be longer than the longest lifetime", 400);
    }
    return next;
}

export async function saveDropLimits(limits: DropLimits) {
    await prisma.$transaction(
        (Object.keys(KEYS) as (keyof DropLimits)[]).map((name) =>
            prisma.appSetting.upsert({
                where: { key: KEYS[name] },
                create: { key: KEYS[name], value: String(limits[name]) },
                update: { value: String(limits[name]) },
            })
        )
    );
}

// --- drop requests (links that let people send files to a user) ---

export type DropRequestSettings = {
    enabled: boolean;       // off = every request link answers 404 and nobody can create one
    roles: Role[];          // roles that may create request links
    allowNoExpiry: boolean; // may a request link stay open with no end date
};

const REQUEST_KEYS: Record<keyof DropRequestSettings, string> = {
    enabled: "drops.requests.enabled",
    roles: "drops.requests.roles",
    allowNoExpiry: "drops.requests.allowNoExpiry",
};

export const DROP_REQUEST_DEFAULTS: DropRequestSettings = { enabled: true, roles: ["ADMIN", "USER"], allowNoExpiry: true };

export async function getDropRequestSettings(): Promise<DropRequestSettings> {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(REQUEST_KEYS) } } });
    const value = (name: keyof DropRequestSettings) => rows.find((r) => r.key === REQUEST_KEYS[name])?.value;
    const settings = { ...DROP_REQUEST_DEFAULTS };

    const enabled = value("enabled");
    if (enabled !== undefined) settings.enabled = enabled === "1";
    const roles = value("roles");
    if (roles !== undefined) settings.roles = roles.split(",").map((r) => r.trim()).filter(isRuleRole);
    const noExpiry = value("allowNoExpiry");
    if (noExpiry !== undefined) settings.allowNoExpiry = noExpiry === "1";
    return settings;
}

// Checks a partial update against the stored values; throws before anything is saved
export async function validateDropRequestSettings(input: unknown): Promise<DropRequestSettings> {
    const next = await getDropRequestSettings();
    if (input === undefined) return next;
    if (!input || typeof input !== "object") throw new FileAccessError("requests must be an object", 400);
    const body = input as Partial<Record<keyof DropRequestSettings, unknown>>;

    for (const name of ["enabled", "allowNoExpiry"] as const) {
        if (body[name] === undefined) continue;
        if (typeof body[name] !== "boolean") throw new FileAccessError(`${name} must be true or false`, 400);
        next[name] = body[name];
    }
    if (body.roles !== undefined) {
        if (!Array.isArray(body.roles) || !body.roles.every(isRuleRole)) {
            throw new FileAccessError(`roles must be a list of ${RULE_ROLES.join(", ")}`, 400);
        }
        next.roles = [...new Set(body.roles)];
    }
    return next;
}

export async function saveDropRequestSettings(settings: DropRequestSettings) {
    const stored: Record<keyof DropRequestSettings, string> = {
        enabled: settings.enabled ? "1" : "0",
        roles: settings.roles.join(","),
        allowNoExpiry: settings.allowNoExpiry ? "1" : "0",
    };
    await prisma.$transaction(
        (Object.keys(REQUEST_KEYS) as (keyof DropRequestSettings)[]).map((name) =>
            prisma.appSetting.upsert({
                where: { key: REQUEST_KEYS[name] },
                create: { key: REQUEST_KEYS[name], value: stored[name] },
                update: { value: stored[name] },
            })
        )
    );
}
