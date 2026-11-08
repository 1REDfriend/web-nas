import { prisma } from "@/lib/db";
import { FileAccessError } from "@/lib/security/path-guard";

// Admin-only settings for PIN rooms, stored in AppSetting like the drop limits

export type PinSettings = {
    enabled: boolean;     // off = every PIN room endpoint answers 404
    roomMB: number;       // files and notes in one room, together
    fileMB: number;       // one file
    maxItems: number;     // files and notes in one room
    roomMinutes: number;  // a room is deleted this long after it was made
    roomsPerIp: number;   // open rooms one IP may have made at once
    totalMB: number;      // every open room together; 0 = no limit
};

export const PIN_DEFAULTS: PinSettings = {
    enabled: false,
    roomMB: 1024,
    fileMB: 1024,
    maxItems: 50,
    roomMinutes: 60,
    roomsPerIp: 3,
    totalMB: 10240,
};

const KEYS: Record<keyof PinSettings, string> = {
    enabled: "pin.enabled",
    roomMB: "pin.roomMB",
    fileMB: "pin.fileMB",
    maxItems: "pin.maxItems",
    roomMinutes: "pin.roomMinutes",
    roomsPerIp: "pin.roomsPerIp",
    totalMB: "pin.totalMB",
};

type NumberKey = Exclude<keyof PinSettings, "enabled">;

const RANGES: Record<NumberKey, { label: string; min: number; max: number }> = {
    roomMB: { label: "Space per room (MB)", min: 1, max: 1024 * 1024 },
    fileMB: { label: "Largest file (MB)", min: 1, max: 1024 * 1024 },
    maxItems: { label: "Items per room", min: 1, max: 1000 },
    roomMinutes: { label: "Room lifetime (minutes)", min: 5, max: 7 * 24 * 60 },
    roomsPerIp: { label: "Open rooms per IP", min: 1, max: 100 },
    totalMB: { label: "Space for all rooms (MB)", min: 0, max: 10 * 1024 * 1024 },
};

const NUMBER_KEYS = Object.keys(RANGES) as NumberKey[];

export async function getPinSettings(): Promise<PinSettings> {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
    const value = (name: keyof PinSettings) => rows.find((r) => r.key === KEYS[name])?.value;
    const settings = { ...PIN_DEFAULTS };

    const enabled = value("enabled");
    if (enabled !== undefined) settings.enabled = enabled === "true";
    for (const name of NUMBER_KEYS) {
        const n = Number(value(name));
        const { min, max } = RANGES[name];
        if (Number.isInteger(n) && n >= min && n <= max) settings[name] = n;
    }
    return settings;
}

// Checks a partial update against the stored values; throws before anything is saved
export async function validatePinSettings(input: unknown): Promise<PinSettings> {
    if (!input || typeof input !== "object") throw new FileAccessError("Invalid PIN room settings", 400);
    const body = input as Partial<Record<keyof PinSettings, unknown>>;
    const next = await getPinSettings();

    if (body.enabled !== undefined) {
        if (typeof body.enabled !== "boolean") throw new FileAccessError("enabled must be true or false", 400);
        next.enabled = body.enabled;
    }
    for (const name of NUMBER_KEYS) {
        const raw = body[name];
        if (raw === undefined) continue;
        const { label, min, max } = RANGES[name];
        if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
            throw new FileAccessError(`${label} must be a whole number from ${min} to ${max}`, 400);
        }
        next[name] = raw;
    }
    if (next.fileMB > next.roomMB) throw new FileAccessError("The largest file cannot be bigger than the space per room", 400);
    return next;
}

export async function savePinSettings(settings: PinSettings) {
    await prisma.$transaction(
        (Object.keys(KEYS) as (keyof PinSettings)[]).map((name) =>
            prisma.appSetting.upsert({
                where: { key: KEYS[name] },
                create: { key: KEYS[name], value: String(settings[name]) },
                update: { value: String(settings[name]) },
            })
        )
    );
}
