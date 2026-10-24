import { prisma } from "@/lib/db";
import { FileAccessError } from "@/lib/security/path-guard";

// Admin-tunable limits for drops, stored in AppSetting

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
