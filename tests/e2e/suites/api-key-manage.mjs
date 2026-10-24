// End-to-end checks for managing API keys from a browser session (/api/user/api-keys).
import fs from "fs";
import path from "path";
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

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
async function call(method, url, { cookie, key, body } = {}) {
    ipCounter++;
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": `10.50.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.51.0.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

const show = (r) => `${r.status} ${r.text.slice(0, 200)}`;
const create = (cookie, body) => call("POST", "/api/user/api-keys", { cookie, body });

try {
    fs.mkdirSync(path.join(envFile.STORAGE_ROOT, "alice", "uploads"), { recursive: true });
    const alice = await login("e2e_alice");
    const bob = await login("e2e_bob");
    const guest = await login("e2e_guest");

    let r = await call("GET", "/api/user/api-keys", { cookie: alice });
    check("a new user has no keys", r.status === 200 && Array.isArray(r.json?.keys) && r.json.keys.length === 0, show(r));

    // --- create ---
    r = await create(alice, { name: "  backup-bot  ", scopes: ["upload", "list", "bogus"], rootPath: "/alice/uploads/", expiresInDays: 30 });
    const secret = r.json?.secret;
    check("create returns the key once", r.status === 201 && /^wnas_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/.test(secret ?? ""), show(r));
    check("create is not cached", (r.headers.get("cache-control") ?? "").includes("no-store"), r.headers.get("cache-control") ?? "");
    check("name is trimmed, scopes cleaned, folder normalized",
        r.json?.key?.name === "backup-bot" && JSON.stringify(r.json?.key?.scopes) === '["list","upload"]' && r.json?.key?.rootPath === "/alice/uploads", show(r));
    const days = (new Date(r.json?.key?.expiresAt).getTime() - Date.now()) / 86400000;
    check("expiresInDays sets the expiry", days > 29.9 && days <= 30, String(days));
    const firstId = r.json?.key?.id;

    r = await create(alice, { name: "capped", scopes: ["upload"], maxUploadMB: 10 });
    check("maxUploadMB sets the key's upload cap", r.status === 201 && r.json?.key?.maxUploadBytes === String(10 * 1024 * 1024), show(r));
    r = await call("GET", "/api/v1/me", { key: r.json?.secret });
    check("the cap reaches /api/v1", r.json?.data?.key?.maxUploadBytes === String(10 * 1024 * 1024), show(r));

    r = await call("GET", "/api/v1/me", { key: secret });
    check("the new key works on /api/v1", r.status === 200 && r.json?.data?.user?.username === "e2e_alice" && r.json?.data?.rootPath === "/alice/uploads", show(r));

    r = await call("GET", "/api/user/api-keys", { cookie: alice });
    const listed = r.json?.keys?.find((k) => k.id === firstId);
    check("list shows the key as active", r.status === 200 && listed?.id === firstId && listed?.status === "active" && listed?.lastUsedAt, show(r));
    check("list never includes the secret or its hash", !r.text.includes(secret.slice(14)) && !r.text.includes("keyHash") && !r.text.includes("key_hash"), "");

    r = await create(alice, { name: "forever", scopes: ["read"] });
    check("no expiry, folder or upload cap are allowed",
        r.status === 201 && r.json?.key?.expiresAt === null && r.json?.key?.rootPath === null && r.json?.key?.maxUploadBytes === null, show(r));
    const foreverSecret = r.json?.secret;
    const foreverId = r.json?.key?.id;

    // --- validation ---
    r = await create(alice, { name: "", scopes: ["read"] });
    check("empty name -> 400", r.status === 400, show(r));
    r = await create(alice, { name: "x".repeat(65), scopes: ["read"] });
    check("name over 64 chars -> 400", r.status === 400, show(r));
    r = await create(alice, { name: "noscope", scopes: [] });
    check("no scopes -> 400", r.status === 400, show(r));
    r = await create(alice, { name: "badscope", scopes: ["admin"] });
    check("only unknown scopes -> 400", r.status === 400, show(r));
    r = await create(alice, { name: "bobs", scopes: ["read"], rootPath: "/bob" });
    check("folder the user cannot open -> 403", r.status === 403, show(r));
    r = await create(alice, { name: "missing", scopes: ["read"], rootPath: "/alice/nope" });
    check("folder that does not exist -> 400", r.status === 400, show(r));
    r = await create(alice, { name: "file", scopes: ["read"], rootPath: "/alice/doc.txt" });
    check("a file as folder -> 400", r.status === 400, show(r));
    for (const bad of [0, -1, 1.5, 3651, "abc"]) {
        r = await create(alice, { name: "exp", scopes: ["read"], expiresInDays: bad });
        check(`expiresInDays ${JSON.stringify(bad)} -> 400`, r.status === 400, show(r));
    }
    r = await call("POST", "/api/user/api-keys", { cookie: alice });
    check("no body -> 400", r.status === 400, show(r));
    for (const bad of [0, -5, 2.5, 102401, "big"]) {
        r = await create(alice, { name: "cap", scopes: ["upload"], maxUploadMB: bad });
        check(`maxUploadMB ${JSON.stringify(bad)} -> 400`, r.status === 400, show(r));
    }

    // --- who may manage keys ---
    r = await call("GET", "/api/user/api-keys");
    check("no login -> 401", r.status === 401, show(r));
    r = await call("GET", "/api/user/api-keys", { cookie: guest });
    check("GUEST cannot list keys", r.status === 403, show(r));
    r = await create(guest, { name: "g", scopes: ["read"] });
    check("GUEST cannot create keys", r.status === 403, show(r));
    r = await call("GET", "/api/user/api-keys", { key: foreverSecret });
    check("an API key cannot list keys", r.status === 401, show(r));
    r = await call("POST", "/api/user/api-keys", { key: foreverSecret, body: { name: "spawn", scopes: ["read"] } });
    check("an API key cannot create keys", r.status === 401, show(r));
    r = await call("POST", "/api/user/api-keys/revoke-all", { key: foreverSecret });
    check("an API key cannot revoke keys", r.status === 401, show(r));

    // --- revoke ---
    r = await call("DELETE", `/api/user/api-keys/${firstId}`, { cookie: bob });
    check("another user cannot revoke the key", r.status === 404, show(r));
    r = await call("GET", "/api/v1/me", { key: secret });
    check("key still works after that attempt", r.status === 200, show(r));
    r = await call("GET", "/api/user/api-keys", { cookie: bob });
    check("another user does not see the key", r.status === 200 && !r.text.includes(firstId), show(r));

    r = await call("DELETE", `/api/user/api-keys/${firstId}`, { cookie: alice });
    check("owner revokes the key", r.status === 200, show(r));
    r = await call("GET", "/api/v1/me", { key: secret });
    check("revoked key stops working", r.status === 401, show(r));
    r = await call("DELETE", `/api/user/api-keys/${firstId}`, { cookie: alice });
    check("revoking twice -> 404", r.status === 404, show(r));
    r = await call("DELETE", "/api/user/api-keys/does-not-exist", { cookie: alice });
    check("unknown id -> 404", r.status === 404, show(r));
    r = await call("GET", "/api/user/api-keys", { cookie: alice });
    check("revoked key is listed as revoked", r.json?.keys?.find((k) => k.id === firstId)?.status === "revoked", show(r));

    // --- revoke all ---
    const extra = (await create(alice, { name: "extra", scopes: ["list"] })).json?.secret;
    r = await call("POST", "/api/user/api-keys/revoke-all", { cookie: alice });
    check("revoke all reports how many", r.status === 200 && r.json?.revoked === 3, show(r));
    r = await call("GET", "/api/v1/me", { key: foreverSecret });
    const r2 = await call("GET", "/api/v1/me", { key: extra });
    check("every key stops working", r.status === 401 && r2.status === 401, `${r.status} ${r2.status}`);
    check("revoke all only touched alice", (await prisma.apiKey.count({ where: { id: foreverId, revokedAt: { not: null } } })) === 1, "");

    // --- active key limit ---
    for (let i = 0; i < 20; i++) await create(bob, { name: `bulk-${i}`, scopes: ["list"] });
    r = await create(bob, { name: "one-too-many", scopes: ["list"] });
    check("21st active key -> 409", r.status === 409, show(r));
    await call("POST", "/api/user/api-keys/revoke-all", { cookie: bob });
    r = await create(bob, { name: "after-revoke", scopes: ["list"] });
    check("revoked keys do not count toward the limit", r.status === 201, show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
