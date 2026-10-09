import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logerror } from "@/lib/logger";
import { FileAction, FILE_ACTIONS, serializeActions } from "./file-actions";

const SEEDED_KEY = "path_rules_seeded";

// Top-level OS folders. They only exist under STORAGE_ROOT when it points at the
// host root (e.g. the Docker setup mounts / at /host_root).
const SYSTEM_DIRS = [
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/lib32",
    "/lib64",
    "/libx32",
    "/lost+found",
    "/proc",
    "/root",
    "/run",
    "/sbin",
    "/snap",
    "/sys",
    "/usr",
    "/var",
];

const ADMIN_SYSTEM_BLOCK: FileAction[] = ["UPLOAD", "RENAME", "MOVE", "DELETE", "SHARE"];
const READ_ONLY_BLOCK: FileAction[] = ["UPLOAD", "RENAME", "MOVE", "DELETE", "SHARE"];

type DefaultRule = {
    path: string;
    role: Role;
    actions: FileAction[];
    recursive: boolean;
    note: string;
};

export const DEFAULT_PATH_RULES: DefaultRule[] = [
    ...SYSTEM_DIRS.flatMap((dir): DefaultRule[] => [
        { path: dir, role: "ADMIN", actions: ADMIN_SYSTEM_BLOCK, recursive: true, note: "System folder (read-only for admins)" },
        { path: dir, role: "USER", actions: [...FILE_ACTIONS], recursive: true, note: "System folder" },
        { path: dir, role: "GUEST", actions: [...FILE_ACTIONS], recursive: true, note: "System folder" },
    ]),
    { path: "/", role: "GUEST", actions: READ_ONLY_BLOCK, recursive: true, note: "Guests are read-only by default" },
];

function isUniqueViolation(err: unknown) {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function upsertDefaults() {
    for (const rule of DEFAULT_PATH_RULES) {
        const data = {
            actions: serializeActions(rule.actions),
            recursive: rule.recursive,
            note: rule.note,
            isDefault: true,
        };

        await prisma.pathRule.upsert({
            where: { idx_path_role_unique: { path: rule.path, role: rule.role } },
            update: data,
            create: { path: rule.path, role: rule.role, ...data },
        });
    }
}

let seeding: Promise<void> | null = null;

// Seeds the default rules once per database. Deleted defaults stay deleted
// until an admin explicitly restores them.
export function ensureDefaultPathRules(): Promise<void> {
    if (!seeding) {
        seeding = (async () => {
            const seeded = await prisma.appSetting.findUnique({ where: { key: SEEDED_KEY } });
            if (seeded) return;

            await upsertDefaults();

            try {
                await prisma.appSetting.create({ data: { key: SEEDED_KEY, value: new Date().toISOString() } });
            } catch (err: unknown) {
                if (!isUniqueViolation(err)) throw err;
            }
        })().catch((err: unknown) => {
            seeding = null;
            logerror("[Path rules seed failed] :", err);
            throw err;
        });
    }

    return seeding;
}

// Brings every default rule back to its original settings; custom rules are kept.
export async function restoreDefaultPathRules() {
    await upsertDefaults();
}

export async function getPathRulesForRole(role: Role) {
    await ensureDefaultPathRules();
    return prisma.pathRule.findMany({ where: { role } });
}
