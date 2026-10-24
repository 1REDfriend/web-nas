// End-to-end checks for drop settings, moving the drop folder, and the expiry sweeper.
// Drops are written straight into the database here; the upload API comes later.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = process.env.E2E_WORK_DIR;
if (!WORK) throw new Error("Run the suites with: npm run test:e2e");
const PROJECT = path.resolve(HERE, "..", "..", "..");
const req = createRequire(path.join(PROJECT, "package.json"));
const { PrismaClient } = req("@prisma/client");

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:47213";
const { password } = JSON.parse(fs.readFileSync(path.join(WORK, "creds.json"), "utf8"));
const envFile = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8"));
const prisma = new PrismaClient({ datasources: { db: { url: envFile.DATABASE_URL } } });
const ROOT = envFile.STORAGE_ROOT;
const DEFAULT_BASE = path.resolve(path.join(envFile.STORAGE_INTERNAL, "drops"));

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
async function call(method, url, { cookie, body } = {}) {
    ipCounter++;
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": `10.60.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.61.0.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

const show = (r) => `${r.status} ${r.text.slice(0, 300)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = (p) => fs.existsSync(p);

async function waitFor(label, predicate, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate()) return true;
        await sleep(300);
    }
    console.log(`      (timed out waiting for ${label})`);
    return false;
}

let userId;
// A finished drop with its file on disk
async function makeDrop(baseDir, data = {}) {
    const id = crypto.randomBytes(18).toString("base64url");
    fs.mkdirSync(path.join(baseDir, id), { recursive: true });
    fs.writeFileSync(path.join(baseDir, id, "file"), `drop ${id}`);
    await prisma.drop.create({
        data: {
            id, fileName: `${id}.txt`, size: BigInt(30), baseDir, userId,
            expiresAt: new Date(Date.now() + 3600_000), completedAt: new Date(), ...data,
        },
    });
    return id;
}
const fileOf = (baseDir, id) => path.join(baseDir, id, "file");
const rowOf = (id) => prisma.drop.findUnique({ where: { id } });

try {
    userId = (await prisma.user.findUnique({ where: { username: "e2e_alice" } })).id;
    const admin = await login("e2e_admin");
    const alice = await login("e2e_alice");
    const put = (body) => call("PUT", "/api/admin/drops", { cookie: admin, body });

    // --- who may see the settings ---
    let r = await call("GET", "/api/admin/drops");
    check("no login -> 401", r.status === 401, show(r));
    r = await call("GET", "/api/admin/drops", { cookie: alice });
    check("USER -> 403", r.status === 403, show(r));
    r = await call("PUT", "/api/admin/drops", { cookie: alice, body: { maxHours: 1 } });
    check("USER cannot change settings", r.status === 403, show(r));

    r = await call("GET", "/api/admin/drops", { cookie: admin });
    check("defaults: 24h, 7 days max, 10 GB quota",
        r.status === 200 && r.json?.limits?.defaultHours === 24 && r.json?.limits?.maxHours === 168 && r.json?.limits?.quotaMB === 10240, show(r));
    check("default folder is in use", r.json?.folder?.folder === null && r.json?.folder?.current === r.json?.folder?.default, show(r));
    check("no drops yet", r.json?.usage?.drops === 0 && r.json?.usage?.bytes === "0", show(r));

    // --- limits ---
    for (const [body, label] of [
        [{ maxHours: 0 }, "maxHours 0"],
        [{ maxHours: 1.5 }, "maxHours 1.5"],
        [{ maxHours: "48" }, "maxHours as text"],
        [{ defaultHours: 200 }, "default above the maximum"],
        [{ quotaMB: -1 }, "negative quota"],
    ]) {
        r = await put(body);
        check(`${label} -> 400`, r.status === 400, show(r));
    }
    r = await put({ defaultHours: 12, maxHours: 48, quotaMB: 0 });
    check("valid limits are saved",
        r.status === 200 && r.json?.limits?.defaultHours === 12 && r.json?.limits?.maxHours === 48 && r.json?.limits?.quotaMB === 0, show(r));
    r = await put({ maxHours: 6 });
    check("maximum below the saved default -> 400", r.status === 400, show(r));
    r = await put({ maxHours: 6, defaultHours: 6, folder: "/" });
    check("a bad folder saves nothing", r.status === 400, show(r));
    r = await call("GET", "/api/admin/drops", { cookie: admin });
    check("limits unchanged after the failed update", r.json?.limits?.maxHours === 48, show(r));

    // --- folder checks ---
    fs.mkdirSync(path.join(ROOT, "alice", "reuse"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "alice", "reuse", ".webnas-drops"), "");
    fs.writeFileSync(path.join(ROOT, "alice", "reuse", "x.txt"), "x");
    for (const [folder, status, label] of [
        ["/", 400, "storage root"],
        ["/alice", 400, "the storage folder itself"],
        ["/etc/drops", 400, "not persistent storage"],
        ["/appdir/drops", 400, "inside PROTECTED_PATHS"],
        ["/internal-store/x", 400, "inside internal storage"],
        ["/alice/doc.txt", 400, "a file"],
        ["/alice/sub", 409, "a folder with files in it"],
        ["/alice/link/drops", 400, "a symlink out of storage"],
    ]) {
        r = await put({ folder });
        check(`folder ${label} -> ${status}`, r.status === status, show(r));
    }

    // --- sweeper ---
    const live = await makeDrop(DEFAULT_BASE);
    const expired = await makeDrop(DEFAULT_BASE, { expiresAt: new Date(Date.now() - 1000) });
    const usedUp = await makeDrop(DEFAULT_BASE, { maxDownloads: 2, downloads: 2 });
    const notUsedUp = await makeDrop(DEFAULT_BASE, { maxDownloads: 2, downloads: 1 });
    const stale = await makeDrop(DEFAULT_BASE, { completedAt: null, createdAt: new Date(Date.now() - 25 * 3600_000) });
    const uploading = await makeDrop(DEFAULT_BASE, { completedAt: null });
    const oldDeleted = await makeDrop(DEFAULT_BASE, { deletedAt: new Date(Date.now() - 8 * 24 * 3600_000) });
    fs.rmSync(path.join(DEFAULT_BASE, oldDeleted), { recursive: true });

    const orphanOld = crypto.randomBytes(18).toString("base64url");
    const orphanNew = crypto.randomBytes(18).toString("base64url");
    for (const name of [orphanOld, orphanNew, "not-a-drop"]) fs.mkdirSync(path.join(DEFAULT_BASE, name), { recursive: true });
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
    for (const name of [orphanOld, "not-a-drop"]) fs.utimesSync(path.join(DEFAULT_BASE, name), twoHoursAgo, twoHoursAgo);

    const swept = await waitFor("expired drop removal", async () => (await rowOf(expired))?.deletedAt != null && !exists(path.join(DEFAULT_BASE, orphanOld)));
    check("sweeper deletes an expired drop", swept && !exists(path.join(DEFAULT_BASE, expired)), "");
    check("sweeper deletes a drop with no downloads left", (await rowOf(usedUp))?.deletedAt != null && !exists(path.join(DEFAULT_BASE, usedUp)), "");
    check("sweeper deletes an upload that never finished", (await rowOf(stale))?.deletedAt != null && !exists(path.join(DEFAULT_BASE, stale)), "");
    check("sweeper forgets rows deleted over a week ago", (await rowOf(oldDeleted)) === null, "");
    check("sweeper keeps a live drop", (await rowOf(live))?.deletedAt === null && exists(fileOf(DEFAULT_BASE, live)), "");
    check("sweeper keeps a drop with downloads left", exists(fileOf(DEFAULT_BASE, notUsedUp)), "");
    check("sweeper keeps an upload in progress", exists(fileOf(DEFAULT_BASE, uploading)), "");
    check("sweeper removes an old leftover folder", !exists(path.join(DEFAULT_BASE, orphanOld)), "");
    check("sweeper leaves a fresh leftover folder alone", exists(path.join(DEFAULT_BASE, orphanNew)), "");
    check("sweeper never touches folders that are not drops", exists(path.join(DEFAULT_BASE, "not-a-drop")), "");

    r = await call("GET", "/api/admin/drops", { cookie: admin });
    check("usage counts live drops only", r.json?.usage?.drops === 3 && r.json?.usage?.bytes === "90", show(r));

    // --- moving the drop folder ---
    const NEW_BASE = path.join(ROOT, "alice", "dropbox");
    r = await put({ folder: "/alice/dropbox/" });
    check("switch to /alice/dropbox", r.status === 200 && r.json?.folder?.folder === "/alice/dropbox" && r.json?.folder?.current === "/alice/dropbox", show(r));
    check("new folder is marked", exists(path.join(NEW_BASE, ".webnas-drops")), "");

    const settle = () => waitFor("migration", async () => {
        const s = await call("GET", "/api/admin/drops", { cookie: admin });
        return s.json?.migration?.running === false && s.json?.migration?.pending === 1; // the upload in progress stays
    });
    check("migration finishes", await settle(), "");
    check("live drops moved with their files",
        exists(fileOf(NEW_BASE, live)) && exists(fileOf(NEW_BASE, notUsedUp)) && !exists(path.join(DEFAULT_BASE, live)), "");
    check("rows point at the new folder", (await rowOf(live))?.baseDir === NEW_BASE, (await rowOf(live))?.baseDir);
    check("an upload in progress is not moved yet", exists(fileOf(DEFAULT_BASE, uploading)), "");
    check("old folder kept while something is left in it", exists(DEFAULT_BASE), "");

    // Finishing the upload lets the sweeper move it too
    await prisma.drop.update({ where: { id: uploading }, data: { completedAt: new Date() } });
    check("sweeper moves a drop that finished later",
        await waitFor("late move", async () => exists(fileOf(NEW_BASE, uploading))) && (await rowOf(uploading))?.baseDir === NEW_BASE, "");

    // --- the drop folder is off limits in the file manager ---
    r = await call("GET", "/api/files/list?path=%2Falice%2Fdropbox", { cookie: admin });
    check("ADMIN cannot browse the drop folder", r.status === 403, show(r));
    r = await call("GET", "/api/files/list?path=%2Falice%2Fdropbox", { cookie: alice });
    check("owner of the parent folder cannot browse it either", r.status === 403, show(r));
    r = await call("GET", "/api/files/list?path=%2Falice", { cookie: alice });
    check("the parent folder still opens", r.status === 200, show(r));

    r = await put({ folder: "/alice/dropbox/inner" });
    check("folder inside the drop folder -> 400", r.status === 400, show(r));
    r = await put({ folder: "/alice/reuse" });
    check("a folder already marked for drops may be reused", r.status === 200, show(r));
    check("drops follow to the reused folder",
        await waitFor("second move", async () => exists(fileOf(path.join(ROOT, "alice", "reuse"), live))), "");
    check("the emptied folder is removed", await waitFor("old folder removal", async () => !exists(NEW_BASE)), "");
    check("files that were already there stay", exists(path.join(ROOT, "alice", "reuse", "x.txt")), "");

    r = await put({ folder: null });
    check("back to the default folder", r.status === 200 && r.json?.folder?.folder === null, show(r));
    check("drops return to the default folder", await waitFor("move back", async () => exists(fileOf(DEFAULT_BASE, live))), "");
    check("the reused folder is kept because it has other files", exists(path.join(ROOT, "alice", "reuse", "x.txt")), "");
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
