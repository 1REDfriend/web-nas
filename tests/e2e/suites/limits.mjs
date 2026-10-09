// Sliding session expiry and public share rate limits.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Fixtures and generated settings, created by run-all.mjs (see fixtures.mjs)
const WORK = process.env.E2E_WORK_DIR;
if (!WORK) throw new Error("Run the suites with: npm run test:e2e");
const PROJECT = path.resolve(HERE, "..", "..", "..");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:47213";
const { password } = JSON.parse(fs.readFileSync(path.join(WORK, "creds.json"), "utf8"));

const req = createRequire(path.join(PROJECT, "package.json"));
process.env.DATABASE_URL = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8")).DATABASE_URL;
const { PrismaClient } = req("@prisma/client");
const { decodeJwt } = req("jose");
const prisma = new PrismaClient();

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function login(username) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });
    const raw = res.headers.get("set-cookie");
    return { cookie: raw.split(";")[0], raw };
}
const list = (cookie) => fetch(`${BASE_URL}/api/files/list`, { headers: { Cookie: cookie } }).then((r) => r.status);
const sessionOf = (cookie) => prisma.activeSession.findUnique({ where: { id: decodeJwt(cookie.split("=").slice(1).join("=")).jti } });

// --- sessions ---
const { cookie, raw } = await login("e2e_alice");
const claims = decodeJwt(cookie.split("=").slice(1).join("="));
const lifetimeDays = (claims.exp - claims.iat) / 86400;
check("token lives at most 7 days", lifetimeDays === 7, `${lifetimeDays}d`);
check("cookie kept for 7 days", /Max-Age=604800/i.test(raw), raw.match(/Max-Age=\d+/i)?.[0]);

let s = await sessionOf(cookie);
const idleMin = (s.expiresAt - Date.now()) / 60000;
check("idle deadline starts at ~60 min", idleMin > 59 && idleMin <= 60, idleMin.toFixed(1));

// Pretend the user was idle for 50 minutes
await prisma.activeSession.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() + 10 * 60000) } });
check("still logged in with 10 min left", (await list(cookie)) === 200);
s = await sessionOf(cookie);
const bumped = (s.expiresAt - Date.now()) / 60000;
check("activity pushes the deadline back to ~60 min", bumped > 59, bumped.toFixed(1));

// No write on every request: a fresh deadline is left alone
const before = s.expiresAt.getTime();
await list(cookie);
check("no DB write when deadline is still fresh", (await sessionOf(cookie)).expiresAt.getTime() === before);

// Idle for longer than the limit
await prisma.activeSession.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
check("idle session is rejected", (await list(cookie)) === 401);

// --- public share rate limits ---
const alice = (await login("e2e_alice")).cookie;
const created = await fetch(`${BASE_URL}/api/user/share`, {
    method: "POST",
    headers: { Cookie: alice, "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/alice/doc.txt" }),
}).then((r) => r.json());
const id = created.url.split("/").pop();
const dl = (ip) => fetch(`${BASE_URL}/api/public/share/${id}/download?path=/`, { headers: { "x-forwarded-for": ip } })
    .then(async (r) => { await r.arrayBuffer(); return r.status; });

const statuses = [];
for (let i = 0; i < 61; i++) statuses.push(await dl("10.7.7.7"));
check("first 60 downloads from one IP succeed", statuses.slice(0, 60).every((x) => x === 200), String(statuses.slice(0, 60).filter((x) => x !== 200).length) + " failed");
check("61st download is throttled", statuses[60] === 429, String(statuses[60]));
check("another IP is unaffected", (await dl("10.6.6.6")) === 200);

await prisma.$disconnect();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
