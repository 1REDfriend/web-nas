// End-to-end checks for per-key limits on /api/v1: requests per minute and upload size.
// Runs in its own group so no other suite's requests count against these keys.
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
const ROOT = path.join(WORK, "storage-root");
const prisma = new PrismaClient({ datasources: { db: { url: envFile.DATABASE_URL } } });
// The server default (API_KEY_RATE_LIMIT is not set for the tests)
const RATE_LIMIT = 120;

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function makeKey(username, data = {}) {
    const user = await prisma.user.findUnique({ where: { username } });
    const prefix = crypto.randomBytes(4).toString("hex");
    const fullKey = `wnas_${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    await prisma.apiKey.create({
        data: { userId: user.id, name: `test-${prefix}`, prefix, keyHash, scopes: "list,read,upload,delete", ...data },
    });
    return fullKey;
}

async function call(method, url, { key, cookie, body, headers = {} } = {}) {
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
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
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.60.0.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

try {
    // --- upload size cap per key ---
    const capped = await makeKey("e2e_alice", { maxUploadBytes: BigInt(1000) });
    let r = await call("GET", "/api/v1/me", { key: capped });
    check("me reports the key's upload cap", r.status === 200 && r.json?.data?.key?.maxUploadBytes === "1000", show(r));

    const put = (p, body) => call("PUT", "/api/v1/files/raw?" + new URLSearchParams({ path: p }), { key: capped, body });
    r = await put("/alice/cap/at-limit.bin", crypto.randomBytes(1000));
    check("raw upload at the cap is accepted", r.status === 201 && r.json?.data?.size === 1000, show(r));
    r = await put("/alice/cap/over.bin", crypto.randomBytes(1001));
    check("raw upload over the cap -> 413", r.status === 413 && r.json?.code === "PAYLOAD_TOO_LARGE" && !exists("alice/cap/over.bin"), show(r));

    // A body without Content-Length (streamed in chunks) is cut off by the byte counter instead
    const chunks = [crypto.randomBytes(600), crypto.randomBytes(600)];
    const stream = new ReadableStream({ pull(controller) { const c = chunks.shift(); if (c) controller.enqueue(c); else controller.close(); } });
    const streamed = await fetch(BASE_URL + "/api/v1/files/raw?" + new URLSearchParams({ path: "/alice/cap/chunked.bin" }), {
        method: "PUT", headers: { Authorization: `Bearer ${capped}` }, body: stream, duplex: "half",
    });
    check("chunked raw upload over the cap -> 413", streamed.status === 413 && !exists("alice/cap/chunked.bin"), `${streamed.status}`);

    const form = (size, name) => {
        const f = new FormData();
        f.append("path", "/alice/cap");
        f.append("file", new Blob([crypto.randomBytes(size)]), name);
        return f;
    };
    r = await call("POST", "/api/v1/files/upload", { key: capped, body: form(900, "small.bin") });
    check("multipart upload under the cap is accepted", r.status === 201, show(r));
    r = await call("POST", "/api/v1/files/upload", { key: capped, body: form(5000, "big.bin") });
    check("multipart upload over the cap -> 413", r.status === 413 && !exists("alice/cap/big.bin"), show(r));

    const uncapped = await makeKey("e2e_alice");
    r = await call("PUT", "/api/v1/files/raw?" + new URLSearchParams({ path: "/alice/cap/free.bin" }), { key: uncapped, body: crypto.randomBytes(50_000) });
    check("a key without a cap uses the server default", r.status === 201, show(r));

    // --- requests per minute per key ---
    const busy = await makeKey("e2e_alice");
    const calm = await makeKey("e2e_alice");
    const statuses = [];
    for (let i = 0; i < RATE_LIMIT; i++) statuses.push((await call("GET", "/api/v1/me", { key: busy })).status);
    check(`first ${RATE_LIMIT} requests in a minute are served`, statuses.every((s) => s === 200), statuses.filter((s) => s !== 200).slice(0, 5).join(","));
    r = await call("GET", "/api/v1/me", { key: busy });
    const retryAfter = Number(r.headers.get("retry-after"));
    check("the next one -> 429 with Retry-After", r.status === 429 && r.json?.code === "RATE_LIMITED" && retryAfter > 0 && retryAfter <= 60, `${show(r)} retry-after=${retryAfter}`);
    r = await call("PUT", "/api/v1/files/raw?" + new URLSearchParams({ path: "/alice/cap/limited.bin" }), { key: busy, body: "x" });
    check("the limit also covers the upload routes", r.status === 429 && !exists("alice/cap/limited.bin"), show(r));
    r = await call("GET", "/api/v1/me", { key: calm });
    check("another key of the same user is not affected", r.status === 200, show(r));
    const cookie = await login("e2e_alice");
    r = await call("GET", "/api/v1/me", { cookie });
    check("the browser session is not affected", r.status === 200, show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
