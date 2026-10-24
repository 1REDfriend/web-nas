// End-to-end checks for API key authentication on /api/v1.
// Keys are written straight into the test database here; the UI for them comes later.
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

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
// A fresh client address per call, so the bad-key limit only trips where a check wants it to
function nextIp() {
    ipCounter++;
    return `10.20.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

async function call(method, url, { cookie, key, ip = nextIp(), headers = {} } = {}) {
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": ip,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...headers,
        },
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

function newKeyMaterial() {
    const prefix = crypto.randomBytes(4).toString("hex");
    const fullKey = `wnas_${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    return { fullKey, prefix, keyHash };
}

async function makeKey(username, data = {}) {
    const user = await prisma.user.findUnique({ where: { username } });
    const { fullKey, prefix, keyHash } = newKeyMaterial();
    const row = await prisma.apiKey.create({
        data: { userId: user.id, name: `test-${prefix}`, prefix, keyHash, scopes: "list,read", ...data },
    });
    return { key: fullKey, row };
}

const show = (r) => `${r.status} ${JSON.stringify(r.json)}`;

try {
    // --- a valid key ---
    const alice = await makeKey("e2e_alice", { scopes: "upload,list", rootPath: "/alice/bot" });
    let r = await call("GET", "/api/v1/me", { key: alice.key });
    check("valid key reaches /api/v1/me", r.status === 200 && r.json?.ok === true, show(r));
    check("me reports the key owner", r.json?.data?.user?.username === "e2e_alice" && r.json?.data?.user?.role === "USER", show(r));
    check("me reports via apikey", r.json?.data?.via === "apikey", show(r));
    check("me reports scopes in fixed order", JSON.stringify(r.json?.data?.scopes) === '["list","upload"]', show(r));
    check("me reports rootPath", r.json?.data?.rootPath === "/alice/bot", show(r));
    check("me reports key name and prefix", r.json?.data?.key?.prefix === alice.row.prefix && r.json?.data?.key?.name === alice.row.name, show(r));
    check("me never returns the key hash", !JSON.stringify(r.json).includes(alice.row.keyHash), "");

    r = await call("GET", "/api/v1/me", { headers: { Authorization: `bearer   ${alice.key}` } });
    check("scheme name is case-insensitive", r.status === 200, show(r));

    const used = await prisma.apiKey.findUnique({ where: { id: alice.row.id } });
    check("lastUsedAt and lastUsedIp are recorded", used.lastUsedAt !== null && typeof used.lastUsedIp === "string", JSON.stringify(used));

    // --- only the hash is stored ---
    const rows = await prisma.apiKey.findMany();
    const secretPart = alice.key.slice(14);
    check("database holds no key secrets", rows.every((row) => !JSON.stringify(row, (_k, v) => (typeof v === "bigint" ? String(v) : v)).includes(secretPart)), "");

    // --- bad keys ---
    r = await call("GET", "/api/v1/me", { key: "wnas_nothere" });
    check("malformed key -> 401", r.status === 401 && r.json?.code === "INVALID_API_KEY", show(r));
    r = await call("GET", "/api/v1/me", { key: newKeyMaterial().fullKey });
    check("unknown key -> 401", r.status === 401 && r.json?.code === "INVALID_API_KEY", show(r));
    const wrongSecret = `wnas_${alice.row.prefix}_${crypto.randomBytes(32).toString("base64url")}`;
    r = await call("GET", "/api/v1/me", { key: wrongSecret });
    check("right prefix, wrong secret -> 401", r.status === 401, show(r));
    r = await call("GET", "/api/v1/me", { headers: { Authorization: "Bearer " } });
    check("empty bearer -> 401", r.status === 401, show(r));

    const revoked = await makeKey("e2e_alice", { revokedAt: new Date() });
    r = await call("GET", "/api/v1/me", { key: revoked.key });
    check("revoked key -> 401", r.status === 401 && r.json?.code === "INVALID_API_KEY", show(r));

    const expired = await makeKey("e2e_alice", { expiresAt: new Date(Date.now() - 1000) });
    r = await call("GET", "/api/v1/me", { key: expired.key });
    check("expired key -> 401", r.status === 401, show(r));

    const future = await makeKey("e2e_alice", { expiresAt: new Date(Date.now() + 3600_000) });
    r = await call("GET", "/api/v1/me", { key: future.key });
    check("key with a future expiry works", r.status === 200, show(r));

    // --- keys only work on /api/v1 ---
    const admin = await makeKey("e2e_admin", { scopes: "list,read,upload,delete" });
    r = await call("GET", "/api/v1/me", { key: admin.key });
    check("admin key works on /api/v1", r.status === 200 && r.json?.data?.user?.role === "ADMIN", show(r));
    for (const url of ["/api/files/list", "/api/admin/user/get", "/api/admin/path-rules", "/api/user/share", "/api/files/system/storage"]) {
        r = await call("GET", url, { key: admin.key });
        check(`admin key is not accepted on ${url}`, r.status === 401, show(r));
    }

    const aliceCookie = await login("e2e_alice");
    r = await call("GET", "/api/admin/path-rules", { cookie: aliceCookie, key: admin.key });
    check("admin key cannot lift a USER cookie on other routes", r.status === 403, show(r));

    // --- forged identity header ---
    const adminRow = await prisma.user.findUnique({ where: { username: "e2e_admin" } });
    const forged = JSON.stringify({ sub: adminRow.id, username: "e2e_admin", role: "ADMIN", via: "apikey", keyId: admin.row.id, scopes: ["delete"] });
    r = await call("GET", "/api/v1/me", { key: alice.key, headers: { "x-user-payload": forged } });
    check("forged header is replaced by the key's identity", r.status === 200 && r.json?.data?.user?.username === "e2e_alice", show(r));
    r = await call("GET", "/api/v1/me", { headers: { "x-user-payload": forged } });
    check("forged header without key or cookie -> 401", r.status === 401 && r.json?.ok === false && r.json?.code === "UNAUTHORIZED", show(r));

    // --- cookies on /api/v1 ---
    r = await call("GET", "/api/v1/me", { cookie: aliceCookie });
    check("browser session works on /api/v1", r.status === 200 && r.json?.data?.via === "session", show(r));
    check("browser session gets every scope", JSON.stringify(r.json?.data?.scopes) === '["list","read","upload","delete"]', show(r));
    check("browser session has no key", r.json?.data?.key === null && r.json?.data?.rootPath === null, show(r));
    r = await call("GET", "/api/v1/me", { cookie: aliceCookie, key: "wnas_bad" });
    check("bad key does not fall back to the cookie", r.status === 401 && r.json?.code === "INVALID_API_KEY", show(r));
    r = await call("GET", "/api/v1/me", { cookie: aliceCookie, headers: { Authorization: "Basic abc" } });
    check("non-bearer Authorization leaves the cookie flow alone", r.status === 200 && r.json?.data?.via === "session", show(r));

    // --- owners who may not use keys ---
    const guest = await makeKey("e2e_guest");
    r = await call("GET", "/api/v1/me", { key: guest.key });
    check("GUEST key -> 403", r.status === 403 && r.json?.code === "API_KEY_NOT_ALLOWED", show(r));

    const bob = await makeKey("e2e_bob");
    await prisma.user.update({ where: { username: "e2e_bob" }, data: { mustChangePassword: true } });
    r = await call("GET", "/api/v1/me", { key: bob.key });
    check("key of an owner who must change password -> 403", r.status === 403 && r.json?.code === "PASSWORD_CHANGE_REQUIRED", show(r));
    await prisma.user.update({ where: { username: "e2e_bob" }, data: { mustChangePassword: false } });
    r = await call("GET", "/api/v1/me", { key: bob.key });
    check("same key works again after the password change", r.status === 200, show(r));

    const temp = await prisma.user.create({ data: { username: "e2e_apikey_temp", passwordHash: "x", role: "USER" } });
    const tempKey = await makeKey("e2e_apikey_temp");
    await prisma.user.delete({ where: { id: temp.id } });
    r = await call("GET", "/api/v1/me", { key: tempKey.key });
    check("key of a deleted user -> 401", r.status === 401, show(r));
    check("deleting the user removed the key row", (await prisma.apiKey.findUnique({ where: { id: tempKey.row.id } })) === null, "");

    // --- bad-key rate limit per client address ---
    const ip = "10.99.99.99";
    let lastBad = null;
    for (let i = 0; i < 20; i++) lastBad = await call("GET", "/api/v1/me", { key: newKeyMaterial().fullKey, ip });
    check("first 20 bad keys from one address -> 401", lastBad.status === 401, show(lastBad));
    r = await call("GET", "/api/v1/me", { key: newKeyMaterial().fullKey, ip });
    check("21st bad key from that address -> 429", r.status === 429 && r.json?.code === "RATE_LIMITED", show(r));
    r = await call("GET", "/api/v1/me", { key: alice.key });
    check("other addresses are not affected", r.status === 200, show(r));
    r = await call("GET", "/api/v1/me", { key: alice.key, ip });
    check("a valid key from the blocked address still works", r.status === 200, show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
