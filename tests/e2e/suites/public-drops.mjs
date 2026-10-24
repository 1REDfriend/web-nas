// End-to-end checks for the public side of drops: the /d/<id> page, its info,
// downloads (counting, limits, Range) and inline previews. No login anywhere here.
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
const envFile = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8"));
const prisma = new PrismaClient({ datasources: { db: { url: envFile.DATABASE_URL } } });
const DROP_BASE = path.resolve(path.join(envFile.STORAGE_INTERNAL, "drops"));
const GONE = "This link has expired or does not exist";

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
async function call(method, url, { key, body, headers = {} } = {}) {
    ipCounter++;
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": `10.80.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...headers,
        },
        body,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
}

const show = (r) => `${r.status} ${r.text.slice(0, 200)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const downloads = async (id) => (await prisma.drop.findUnique({ where: { id } }))?.downloads;

async function makeKey() {
    const user = await prisma.user.findUnique({ where: { username: "e2e_alice" } });
    const prefix = crypto.randomBytes(4).toString("hex");
    const fullKey = `wnas_${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    await prisma.apiKey.create({ data: { userId: user.id, name: `test-${prefix}`, prefix, keyHash, scopes: "drop" } });
    return fullKey;
}

try {
    const key = await makeKey();
    const drop = async (params, content) => {
        const r = await call("PUT", `/api/v1/drops/raw?${new URLSearchParams(params)}`, { key, body: content });
        if (r.status !== 201) throw new Error("could not create drop: " + show(r));
        return r.json.data;
    };

    const open = await drop({ name: "notes.txt" }, "0123456789");
    const pic = await drop({ name: "pic.png" }, "not really a png");
    const limited = await drop({ name: "secret.png", maxDownloads: "2" }, "limited content");
    const thai = await drop({ name: "รายงาน ปี 2026.pdf" }, "pdf");

    // --- info for the page ---
    let r = await call("GET", `/api/public/drops/${open.id}`);
    check("info needs no login", r.status === 200 && r.json?.drop?.name === "notes.txt" && r.json?.drop?.size === "10", show(r));
    check("info is not cached", (r.headers.get("cache-control") ?? "").includes("no-store"), r.headers.get("cache-control") ?? "");
    check("info says nothing about the owner", !/alice|userId|keyId|baseDir/i.test(r.text), r.text);
    check("unlimited drop: no download count shown", r.json?.drop?.downloadsLeft === null && r.json?.drop?.preview === null, show(r));
    r = await call("GET", `/api/public/drops/${pic.id}`);
    check("image drop can be previewed", r.json?.drop?.preview === "image", show(r));
    r = await call("GET", `/api/public/drops/${limited.id}`);
    check("limited drop: count shown, no preview", r.json?.drop?.downloadsLeft === 2 && r.json?.drop?.preview === null, show(r));
    check("opening the info is not a download", (await downloads(limited.id)) === 0, "");

    for (const [id, label] of [
        ["A".repeat(24), "unknown id"],
        ["short", "malformed id"],
        ["..%2F..%2Fetc", "path-like id"],
    ]) {
        r = await call("GET", `/api/public/drops/${id}`);
        check(`${label} -> 404`, r.status === 404 && r.json?.error === GONE, show(r));
    }

    // --- unlimited downloads: counted, resumable ---
    r = await call("HEAD", `/api/public/drops/${open.id}/download`);
    check("HEAD gives size and type", r.status === 200 && r.headers.get("content-length") === "10" && r.headers.get("accept-ranges") === "bytes", `${r.status}`);
    check("HEAD is not a download", (await downloads(open.id)) === 0, "");

    r = await call("GET", `/api/public/drops/${open.id}/download`);
    check("download sends the file", r.status === 200 && r.text === "0123456789", show(r));
    check("download uses the drop's name", /filename="notes.txt"/.test(r.headers.get("content-disposition") ?? ""), r.headers.get("content-disposition") ?? "");
    check("download is not cacheable", (r.headers.get("cache-control") ?? "").includes("no-store"), r.headers.get("cache-control") ?? "");
    check("download is counted", (await downloads(open.id)) === 1, "");

    r = await call("GET", `/api/public/drops/${open.id}/download`, { headers: { Range: "bytes=0-3" } });
    check("range from the start -> 206, counted", r.status === 206 && r.text === "0123" && (await downloads(open.id)) === 2, show(r));
    r = await call("GET", `/api/public/drops/${open.id}/download`, { headers: { Range: "bytes=4-" } });
    check("rest of a resumed download -> 206, not counted", r.status === 206 && r.text === "456789" && (await downloads(open.id)) === 2, show(r));
    r = await call("GET", `/api/public/drops/${open.id}/download`, { headers: { Range: "bytes=50-" } });
    check("range past the end -> 416", r.status === 416, show(r));

    r = await call("GET", `/api/public/drops/${thai.id}/download`);
    check("non-ASCII name is sent safely",
        (r.headers.get("content-disposition") ?? "").includes(`filename*=UTF-8''${encodeURIComponent("รายงาน ปี 2026.pdf")}`), r.headers.get("content-disposition") ?? "");

    // --- previews ---
    r = await call("GET", `/api/public/drops/${pic.id}/raw`);
    check("image preview is shown inline", r.status === 200 && r.headers.get("content-type") === "image/png" && r.headers.get("content-disposition") === "inline", show(r));
    check("preview cannot run script", (r.headers.get("content-security-policy") ?? "").includes("sandbox") && r.headers.get("x-content-type-options") === "nosniff", "");
    check("preview is not a download", (await downloads(pic.id)) === 0, "");
    r = await call("GET", `/api/public/drops/${open.id}/raw`);
    check("text cannot be previewed -> 415", r.status === 415, show(r));
    r = await call("GET", `/api/public/drops/${limited.id}/raw`);
    check("limited drop cannot be previewed -> 415", r.status === 415, show(r));

    // --- limited downloads ---
    r = await call("HEAD", `/api/public/drops/${limited.id}/download`);
    check("limited drop does not offer ranges", r.status === 200 && r.headers.get("accept-ranges") === null, `${r.status}`);
    r = await call("GET", `/api/public/drops/${limited.id}/download`, { headers: { Range: "bytes=1-" } });
    check("a range on a limited drop gets the whole file", r.status === 200 && r.text === "limited content", show(r));
    check("and it is counted", (await downloads(limited.id)) === 1, "");
    r = await call("GET", `/api/public/drops/${limited.id}/download`);
    check("last download works", r.status === 200 && r.text === "limited content", show(r));
    r = await call("GET", `/api/public/drops/${limited.id}/download`);
    check("no downloads left -> 404", r.status === 404 && r.json?.error === GONE, show(r));
    r = await call("GET", `/api/public/drops/${limited.id}`);
    check("used-up drop's page says it is gone", r.status === 404, show(r));
    check("count never goes past the limit", (await downloads(limited.id)) === 2, "");

    let deleted = false;
    for (let i = 0; i < 40 && !deleted; i++) {
        deleted = !fs.existsSync(path.join(DROP_BASE, limited.id));
        if (!deleted) await sleep(250);
    }
    check("used-up drop's file is deleted", deleted, "");

    const once = await drop({ name: "once.bin", maxDownloads: "1" }, "only once");
    const results = await Promise.all(Array.from({ length: 30 }, () => call("GET", `/api/public/drops/${once.id}/download`)));
    const served = results.filter((x) => x.status === 200).length;
    check("parallel downloads of a one-time drop: exactly one gets it", served === 1 && results.every((x) => x.status === 200 || x.status === 404), results.map((x) => x.status).join(","));

    // --- expired and removed ---
    await prisma.drop.update({ where: { id: pic.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    r = await call("GET", `/api/public/drops/${pic.id}/download`);
    check("expired drop -> 404 even before the sweeper runs", r.status === 404 && r.json?.error === GONE, show(r));
    r = await call("DELETE", `/api/v1/drops?id=${thai.id}`, { key });
    r = await call("GET", `/api/public/drops/${thai.id}/download`);
    check("removed drop -> 404", r.status === 404, show(r));
    fs.rmSync(path.join(DROP_BASE, open.id, "file"));
    r = await call("GET", `/api/public/drops/${open.id}/download`);
    check("drop whose file vanished -> 404", r.status === 404 && r.json?.error === GONE, show(r));

    // --- the page ---
    const live = await drop({ name: "page.txt" }, "page");
    r = await call("GET", `/d/${live.id}`);
    check("drop page loads without login", r.status === 200 && r.text.includes("<html"), `${r.status}`);
    check("drop page asks search engines to stay away", /<meta name="robots" content="noindex, ?nofollow"/.test(r.text), "");
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
