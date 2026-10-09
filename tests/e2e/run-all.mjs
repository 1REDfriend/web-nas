// Runs the e2e suites against a real `next dev` server with isolated fixtures.
//
//   npm run test:e2e                 every suite
//   npm run test:e2e -- search trash only suites whose name contains a filter
//
// E2E_PORT picks the port (default 47213), E2E_WORK_DIR the fixture folder
// (default: <os temp>/web-nas-e2e). Suites in one group share a server and
// fixtures; each group starts from a fresh copy.
import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { PROJECT, WORK, buildTemplateDatabase, resetFixtures } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.E2E_PORT ?? "47213";
const BASE_URL = `http://localhost:${PORT}`;

// Suites that modify the same fixtures are kept in separate groups
const GROUPS = [
    ["path-guard", "share-links", "auth-sessions", "terminal-gate"],
    ["offline-disk", "limits"],
    ["starred-recent-preview"],
    ["trash-restore"],
    ["persistent-storage"],
    ["media-preview"],
    ["search"],
    ["empty-trash"],
    ["thumbnails"],
    ["share-media"],
];

function startServer(env) {
    const child = spawn("npx", ["next", "dev", "-p", PORT], {
        cwd: PROJECT,
        env: { ...process.env, ...env, NODE_ENV: "development" },
        shell: true,
        // Own process group on POSIX so the whole tree can be stopped
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
    });

    let log = "";
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("server did not start:\n" + log)), 120_000);
        const onData = (chunk) => {
            log += chunk;
            if (log.includes("Ready in")) {
                clearTimeout(timer);
                resolve();
            }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("exit", (code) => reject(new Error(`server exited (${code}):\n` + log)));
    });

    return { child, ready };
}

function stopServer(child) {
    if (child.exitCode !== null) return;
    if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
        try {
            process.kill(-child.pid, "SIGTERM");
        } catch {
            // already gone
        }
    }
}

function runSuite(name) {
    const result = spawnSync(process.execPath, [path.join(HERE, "suites", `${name}.mjs`)], {
        env: { ...process.env, E2E_BASE_URL: BASE_URL, E2E_WORK_DIR: WORK },
        encoding: "utf8",
    });
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    return { ok: result.status === 0, output };
}

const filters = process.argv.slice(2);
const groups = GROUPS
    .map((group) => group.filter((name) => filters.length === 0 || filters.some((f) => name.includes(f))))
    .filter((group) => group.length > 0);

if (groups.length === 0) {
    console.error(`No suite matches: ${filters.join(", ")}`);
    process.exit(1);
}

fs.mkdirSync(WORK, { recursive: true });
console.log("Preparing database template...");
buildTemplateDatabase();

let failed = 0;
for (const group of groups) {
    const env = await resetFixtures();
    const { child, ready } = startServer(env);

    try {
        await ready;
        for (const name of group) {
            const { ok, output } = runSuite(name);
            if (!ok) failed++;
            console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
            // Show every check of a failing suite, only the summary of a passing one
            if (!ok) console.log(output.replace(/^/gm, "      "));
        }
    } finally {
        stopServer(child);
        // Windows keeps the database file locked for a moment after the process exits
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }
}

console.log(failed === 0 ? "\nAll suites passed" : `\n${failed} suite(s) failed`);
process.exit(failed === 0 ? 0 : 1);
