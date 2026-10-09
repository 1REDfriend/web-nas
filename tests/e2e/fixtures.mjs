// Test fixtures for the e2e suites: a fake storage tree, a fresh database and
// four accounts, rebuilt for each group of suites so suites that change files
// cannot affect each other.
//
// They live in the OS temp folder, not in the repo: the app always locks its own
// folder (process.cwd()), so storage inside the project would be off limits.
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT = path.resolve(HERE, "..", "..");
export const WORK = process.env.E2E_WORK_DIR ?? path.join(os.tmpdir(), "web-nas-e2e");

const ROOT = path.join(WORK, "storage-root");
const OUTSIDE = path.join(WORK, "outside");
const DB = path.join(WORK, "test.sqlite");
const TEMPLATE_DB = path.join(WORK, "template.sqlite");

const req = createRequire(path.join(PROJECT, "package.json"));

function sqliteUrl(file) {
    return "file:" + file.replace(/\\/g, "/");
}

// Empty database with the current schema; built once per run and copied per group
export function buildTemplateDatabase() {
    fs.mkdirSync(WORK, { recursive: true });
    fs.rmSync(TEMPLATE_DB, { force: true });

    const result = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
        cwd: PROJECT,
        env: { ...process.env, DATABASE_URL: sqliteUrl(TEMPLATE_DB) },
        shell: true,
        encoding: "utf8",
    });
    if (result.status !== 0) {
        throw new Error("prisma db push failed:\n" + result.stdout + result.stderr);
    }
}

const FILES = {
    "alice/doc.txt": "alice doc",
    "alice/sub/inner/note.txt": "inner",
    "alice/keep.txt": "keep",
    "bob/secret.txt": "bob secret",
    "etc/passwd": "root:x:0:0",
    // Stands in for the app folder with its secrets (PROTECTED_PATHS)
    "appdir/.env": "JWT_SECRET=leak",
    "shared/readme.txt": "shared",
    "alice/pics/a.txt": "file a",
    "alice/pics/deep/b.txt": "file b",
};

export async function resetFixtures() {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.rmSync(OUTSIDE, { recursive: true, force: true });

    for (const [rel, content] of Object.entries(FILES)) {
        const p = path.join(ROOT, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
    }
    fs.mkdirSync(path.join(ROOT, "internal-store"), { recursive: true });
    fs.mkdirSync(OUTSIDE, { recursive: true });
    fs.writeFileSync(path.join(OUTSIDE, "outside.txt"), "outside");
    // A link that escapes the storage area ("junction" works on Windows without admin rights)
    fs.symlinkSync(OUTSIDE, path.join(ROOT, "alice", "link"), "junction");

    fs.copyFileSync(TEMPLATE_DB, DB);
    process.env.DATABASE_URL = sqliteUrl(DB);

    const bcrypt = req("bcrypt");
    const { PrismaClient } = req("@prisma/client");
    const prisma = new PrismaClient();

    // Fresh secrets per run: the real .env is never read or needed
    const password = crypto.randomBytes(12).toString("hex");
    const hash = await bcrypt.hash(password, 10);

    const users = [
        ["e2e_admin", "ADMIN", []],
        ["e2e_alice", "USER", ["alice"]],
        ["e2e_bob", "USER", ["bob"]],
        ["e2e_guest", "GUEST", ["shared"]],
    ];
    for (const [username, role, roots] of users) {
        const user = await prisma.user.create({ data: { username, passwordHash: hash, role } });
        for (const rootPath of roots) await prisma.pathMap.create({ data: { rootPath, userId: user.id } });
    }
    await prisma.$disconnect();

    const env = {
        DATABASE_URL: sqliteUrl(DB),
        JWT_SECRET: crypto.randomBytes(32).toString("hex"),
        TOKEN_COOKIE: "e2e_session",
        STORAGE_ROOT: ROOT,
        STORAGE_INTERNAL: path.join(ROOT, "internal-store"),
        PROTECTED_PATHS: path.join(ROOT, "appdir"),
        // Stand-ins for the mounted disk: everything else under ROOT is "container only"
        STORAGE_WRITABLE_PATHS: ["alice", "bob", "shared"].map((d) => path.join(ROOT, d)).join(","),
    };

    fs.writeFileSync(path.join(WORK, "creds.json"), JSON.stringify({ password }));
    fs.writeFileSync(path.join(WORK, "env.json"), JSON.stringify(env, null, 2));
    return env;
}
