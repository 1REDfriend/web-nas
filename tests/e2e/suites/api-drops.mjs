// End-to-end checks for creating, listing and removing drops through /api/v1/drops.
// Downloading them (the public side) is covered by its own suite.
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
const DROP_BASE = path.resolve(path.join(envFile.STORAGE_INTERNAL, "drops"));

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
async function call(method, url, { key, cookie, body, headers = {} } = {}) {
    ipCounter++;
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": `10.70.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
        },
        body,
        ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.71.0.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

async function makeKey(username, data = {}) {
    const user = await prisma.user.findUnique({ where: { username } });
    const prefix = crypto.randomBytes(4).toString("hex");
    const fullKey = `wnas_${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    const row = await prisma.apiKey.create({ data: { userId: user.id, name: `test-${prefix}`, prefix, keyHash, scopes: "drop", ...data } });
    return { key: fullKey, row };
}

const show = (r) => `${r.status} ${r.text.slice(0, 300)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hoursFromNow = (iso) => (new Date(iso).getTime() - Date.now()) / 3600_000;
const qs = (params) => new URLSearchParams(params).toString();
const raw = (key, params, body, extra = {}) => call("PUT", `/api/v1/drops/raw?${qs(params)}`, { key, body, ...extra });

function multipart(fields, file) {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    if (file) form.append("file", new Blob([file.content]), file.name);
    return form;
}

async function dropCount(userId) {
    return prisma.drop.count({ where: { userId } });
}
function leftoverFolders(knownIds) {
    if (!fs.existsSync(DROP_BASE)) return [];
    return fs.readdirSync(DROP_BASE).filter((name) => name !== ".webnas-drops" && !knownIds.has(name));
}

try {
    const alice = await prisma.user.findUnique({ where: { username: "e2e_alice" } });
    const aliceKey = (await makeKey("e2e_alice")).key;
    const bobKey = (await makeKey("e2e_bob")).key;
    const noDropKey = (await makeKey("e2e_alice", { scopes: "list,read,upload,delete" })).key;
    const smallKey = (await makeKey("e2e_alice", { maxUploadBytes: BigInt(100) })).key;
    const admin = await login("e2e_admin");
    const aliceCookie = await login("e2e_alice");
    const guestCookie = await login("e2e_guest");
    const known = new Set();

    // --- raw upload ---
    let r = await raw(aliceKey, { name: "report.txt", expiresIn: "2h", maxDownloads: "3" }, "hello drop");
    const first = r.json?.data;
    check("raw upload -> 201", r.status === 201 && r.json?.ok === true, show(r));
    check("answer describes the drop",
        first?.name === "report.txt" && first?.size === "10" && first?.maxDownloads === 3 && first?.downloads === 0 && first?.mimeType === "text/plain", show(r));
    check("lifetime starts now", Math.abs(hoursFromNow(first?.expiresAt) - 2) < 0.05, first?.expiresAt);
    check("links point at this server",
        first?.url === `${BASE_URL}/d/${first?.id}` && first?.downloadUrl === `${BASE_URL}/api/public/drops/${first?.id}/download`, show(r));
    check("file is stored in the drop folder", fs.readFileSync(path.join(DROP_BASE, first.id, "file"), "utf8") === "hello drop", "");
    const row = await prisma.drop.findUnique({ where: { id: first.id } });
    check("row is finished and owned by alice and her key", row?.completedAt !== null && row?.userId === alice.id && row?.keyId !== null, JSON.stringify(row, (_k, v) => (typeof v === "bigint" ? String(v) : v)));
    known.add(first.id);

    r = await raw(aliceKey, { name: "plain.bin" }, "x");
    check("default lifetime is the admin default (24h)", r.status === 201 && Math.abs(hoursFromNow(r.json?.data?.expiresAt) - 24) < 0.05, show(r));
    check("no download limit unless asked", r.json?.data?.maxDownloads === null, show(r));
    known.add(r.json?.data?.id);

    r = await raw(aliceKey, {}, "nameless");
    check("missing name -> called \"file\"", r.status === 201 && r.json?.data?.name === "file", show(r));
    known.add(r.json?.data?.id);
    r = await raw(aliceKey, { name: "../../etc/evil.txt" }, "x");
    check("path in the name is dropped", r.status === 201 && r.json?.data?.name === "evil.txt", show(r));
    known.add(r.json?.data?.id);

    r = await raw(aliceKey, { name: "a.txt" }, "x", { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "nas.example.com" } });
    check("links follow the forwarded host and protocol", r.json?.data?.url?.startsWith("https://nas.example.com/d/"), show(r));
    known.add(r.json?.data?.id);
    r = await raw(aliceKey, { name: "a.txt" }, "x", { headers: { "x-forwarded-host": "evil.com/<script>" } });
    check("a malformed forwarded host is ignored", r.json?.data?.url?.startsWith(`${BASE_URL}/d/`), show(r));
    known.add(r.json?.data?.id);

    // --- bad options are refused before anything is stored ---
    const before = await dropCount(alice.id);
    for (const [params, label] of [
        [{ name: "..", expiresIn: "1h" }, 'name ".."'],
        [{ expiresIn: "abc" }, "expiresIn abc"],
        [{ expiresIn: "0m" }, "expiresIn 0m"],
        [{ expiresIn: "169h" }, "expiresIn past the maximum"],
        [{ expiresIn: "8d" }, "expiresIn 8d"],
        [{ maxDownloads: "0" }, "maxDownloads 0"],
        [{ maxDownloads: "1.5" }, "maxDownloads 1.5"],
        [{ maxDownloads: "-2" }, "maxDownloads -2"],
    ]) {
        r = await raw(aliceKey, params, "x");
        check(`${label} -> 400`, r.status === 400 && r.json?.code === "BAD_REQUEST", show(r));
    }
    check("refused uploads left no rows", (await dropCount(alice.id)) === before, "");

    // --- who may drop ---
    r = await raw(null, { name: "x" }, "x");
    check("no key -> 401", r.status === 401, show(r));
    r = await raw("wnas_deadbeef_" + "A".repeat(43), { name: "x" }, "x");
    check("bad key -> 401", r.status === 401 && r.json?.code === "INVALID_API_KEY", show(r));
    r = await raw(noDropKey, { name: "x" }, "x");
    check("key without the drop scope -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/v1/drops", { key: noDropKey });
    check("key without the drop scope cannot list drops", r.status === 403, show(r));
    r = await call("PUT", "/api/v1/drops/raw?name=x", { cookie: guestCookie, body: "x" });
    check("GUEST session -> 403", r.status === 403, show(r));
    r = await call("PUT", "/api/v1/drops/raw?name=web.txt", { cookie: aliceCookie, body: "from the browser" });
    check("a logged-in user can drop", r.status === 201 && r.json?.data?.name === "web.txt", show(r));
    known.add(r.json?.data?.id);

    // --- size limits ---
    const countBefore = await dropCount(alice.id);
    r = await raw(smallKey, { name: "big.bin" }, "y".repeat(200));
    check("over the key's upload cap -> 413", r.status === 413 && r.json?.code === "PAYLOAD_TOO_LARGE", show(r));
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("z".repeat(150))); c.close(); } });
    r = await call("PUT", "/api/v1/drops/raw?name=chunked.bin", { key: smallKey, body: stream });
    check("over the cap without Content-Length -> 413", r.status === 413, show(r));
    check("refused uploads left no rows or folders", (await dropCount(alice.id)) === countBefore && leftoverFolders(known).length === 0, leftoverFolders(known).join(","));

    // --- quota ---
    r = await call("PUT", "/api/admin/drops", { cookie: admin, body: JSON.stringify({ quotaMB: 1 }), headers: { "Content-Type": "application/json" } });
    check("admin sets a 1 MB quota", r.status === 200, show(r));
    await prisma.drop.deleteMany({ where: { userId: alice.id } });
    for (const id of known) fs.rmSync(path.join(DROP_BASE, id), { recursive: true, force: true });
    known.clear();

    r = await raw(aliceKey, { name: "half.bin" }, "h".repeat(600 * 1024));
    check("upload within the quota", r.status === 201, show(r));
    known.add(r.json?.data?.id);
    r = await raw(aliceKey, { name: "more.bin" }, "m".repeat(600 * 1024));
    check("upload past the quota -> 413", r.status === 413 && /quota/.test(r.json?.error ?? ""), show(r));
    r = await raw(aliceKey, { name: "rest.bin" }, "r".repeat(1024 * 1024 - 600 * 1024));
    check("upload that fills the quota exactly", r.status === 201, show(r));
    known.add(r.json?.data?.id);
    r = await raw(aliceKey, { name: "one.bin" }, "1");
    check("full quota -> 413", r.status === 413 && /full/.test(r.json?.error ?? ""), show(r));
    r = await raw(bobKey, { name: "bob.txt" }, "bob's file");
    check("the quota is per user", r.status === 201, show(r));
    const bobDrop = r.json?.data;
    known.add(bobDrop?.id);
    await call("PUT", "/api/admin/drops", { cookie: admin, body: JSON.stringify({ quotaMB: 0 }), headers: { "Content-Type": "application/json" } });

    // --- multipart ---
    r = await call("POST", "/api/v1/drops/upload", {
        key: aliceKey,
        body: multipart({ expiresIn: "30m", maxDownloads: "1" }, { name: "photo.png", content: "png bytes" }),
    });
    const mp = r.json?.data;
    check("multipart upload -> 201", r.status === 201 && mp?.name === "photo.png" && mp?.mimeType === "image/png" && mp?.maxDownloads === 1, show(r));
    check("multipart lifetime from the form", Math.abs(hoursFromNow(mp?.expiresAt) - 0.5) < 0.05, mp?.expiresAt);
    check("multipart file stored as-is, with no temp files beside it",
        fs.readFileSync(path.join(DROP_BASE, mp.id, "file"), "utf8") === "png bytes" && fs.readdirSync(path.join(DROP_BASE, mp.id)).join() === "file", "");
    known.add(mp.id);

    r = await call("POST", "/api/v1/drops/upload?name=renamed.txt", { key: aliceKey, body: multipart({ name: "ignored.txt" }, { name: "orig.txt", content: "abc" }) });
    check("name in the query wins", r.status === 201 && r.json?.data?.name === "renamed.txt", show(r));
    known.add(r.json?.data?.id);

    const mpBefore = await dropCount(alice.id);
    r = await call("POST", "/api/v1/drops/upload", { key: aliceKey, body: multipart({ name: "nofile.txt" }) });
    check("multipart without a file -> 400", r.status === 400, show(r));
    r = await call("POST", "/api/v1/drops/upload?expiresIn=forever", { key: aliceKey, body: multipart({}, { name: "a.txt", content: "a" }) });
    check("bad option in the query -> 400", r.status === 400, show(r));
    r = await call("POST", "/api/v1/drops/upload", { key: aliceKey, body: multipart({ maxDownloads: "zero" }, { name: "a.txt", content: "a" }) });
    check("bad option in the form -> 400", r.status === 400, show(r));
    r = await call("POST", "/api/v1/drops/upload", { key: smallKey, body: multipart({}, { name: "big.bin", content: "b".repeat(5000) }) });
    check("multipart over the cap -> 413", r.status === 413, show(r));
    r = await call("POST", "/api/v1/drops/upload", { key: noDropKey, body: multipart({}, { name: "a.txt", content: "a" }) });
    check("multipart without the drop scope -> 403", r.status === 403, show(r));
    check("failed multipart uploads left no rows", (await dropCount(alice.id)) === mpBefore, "");
    let clean = false;
    for (let i = 0; i < 20 && !clean; i++) {
        clean = leftoverFolders(known).length === 0;
        if (!clean) await sleep(250);
    }
    check("failed multipart uploads left no folders", clean, leftoverFolders(known).join(","));

    // --- list, get, delete ---
    const expiredId = crypto.randomBytes(18).toString("base64url");
    await prisma.drop.create({ data: { id: expiredId, fileName: "old.txt", baseDir: DROP_BASE, userId: alice.id, expiresAt: new Date(Date.now() - 1000), completedAt: new Date() } });
    const usedUpId = crypto.randomBytes(18).toString("base64url");
    await prisma.drop.create({ data: { id: usedUpId, fileName: "used.txt", baseDir: DROP_BASE, userId: alice.id, expiresAt: new Date(Date.now() + 3600_000), completedAt: new Date(), maxDownloads: 1, downloads: 1 } });

    r = await call("GET", "/api/v1/drops", { key: aliceKey });
    const listed = (r.json?.data?.drops ?? []).map((d) => d.id);
    check("list shows alice's live drops", r.status === 200 && listed.includes(mp.id) && listed.length === 4, show(r));
    check("list hides expired and used-up drops", !listed.includes(expiredId) && !listed.includes(usedUpId), listed.join(","));
    check("list hides other users' drops", !listed.includes(bobDrop.id), "");
    check("newest first", listed[0] !== undefined && listed.indexOf(mp.id) > 0, listed.join(","));

    r = await call("GET", `/api/v1/drops?id=${mp.id}`, { key: aliceKey });
    check("get one drop", r.status === 200 && r.json?.data?.id === mp.id, show(r));
    r = await call("GET", `/api/v1/drops?id=${bobDrop.id}`, { key: aliceKey });
    check("another user's drop -> 404", r.status === 404, show(r));
    r = await call("GET", `/api/v1/drops?id=${expiredId}`, { key: aliceKey });
    check("expired drop -> 404", r.status === 404, show(r));

    r = await call("DELETE", `/api/v1/drops?id=${bobDrop.id}`, { key: aliceKey });
    check("cannot remove another user's drop", r.status === 404 && fs.existsSync(path.join(DROP_BASE, bobDrop.id, "file")), show(r));
    r = await call("DELETE", "/api/v1/drops", { key: aliceKey });
    check("remove without id -> 400", r.status === 400, show(r));
    r = await call("DELETE", `/api/v1/drops?id=${mp.id}`, { key: aliceKey });
    check("owner removes a drop", r.status === 200, show(r));
    r = await call("GET", `/api/v1/drops?id=${mp.id}`, { key: aliceKey });
    check("removed drop is gone at once", r.status === 404, show(r));
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) {
        gone = !fs.existsSync(path.join(DROP_BASE, mp.id));
        if (!gone) await sleep(250);
    }
    check("removed drop's file is deleted", gone, "");
    r = await call("DELETE", `/api/v1/drops?id=${mp.id}`, { key: aliceKey });
    check("removing twice -> 404", r.status === 404, show(r));

    r = await call("GET", "/api/v1/drops", { cookie: aliceCookie });
    check("a logged-in user can list drops", r.status === 200 && Array.isArray(r.json?.data?.drops), show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
