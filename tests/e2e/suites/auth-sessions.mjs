// End-to-end checks for registration, sessions, password change and login limits.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Fixtures and generated settings, created by run-all.mjs (see fixtures.mjs)
const WORK = process.env.E2E_WORK_DIR;
if (!WORK) throw new Error("Run the suites with: npm run test:e2e");
const PROJECT = path.resolve(HERE, "..", "..", "..");
const req = createRequire(path.join(PROJECT, "package.json"));
const { SignJWT } = req("jose");

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:47213";
const { password } = JSON.parse(fs.readFileSync(path.join(WORK, "creds.json"), "utf8"));
// Secrets generated for this test run (never the real .env)
const envFile = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8"));

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function call(method, url, { cookie, body, headers = {} } = {}) {
    const res = await fetch(BASE_URL + url, {
        method,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
}

async function login(username, pw = password, ip = "10.0.0.1") {
    const r = await call("POST", "/api/auth/login", { body: { username, password: pw }, headers: { "x-forwarded-for": ip } });
    return { ...r, cookie: r.setCookie?.split(";")[0] };
}

const cookieName = envFile.TOKEN_COOKIE;

// --- registration (item 4) ---
let r = await call("GET", "/api/auth/setup-status");
check("setup-status says setup is done", r.status === 200 && r.json?.needsSetup === false, JSON.stringify(r.json));
r = await call("POST", "/api/auth/registor", { body: { username: "intruder1", password: "longenough1" } });
check("anonymous registration closed", r.status === 403, `${r.status} ${r.json?.error}`);
const alice = (await login("e2e_alice")).cookie;
r = await call("POST", "/api/auth/registor", { cookie: alice, body: { username: "intruder2", password: "longenough1" } });
check("USER cannot register accounts", r.status === 403, `${r.status}`);
r = await call("POST", "/api/admin/user/create", { cookie: alice, body: { username: "intruder3", role: "ADMIN" } });
check("USER cannot use admin create", r.status === 403, `${r.status}`);
r = await login("intruder2", "longenough1");
check("no intruder account was created", r.status === 401, `${r.status}`);

// --- forged identity header ---
const admin = (await login("e2e_admin")).cookie;
const adminId = (await call("GET", "/api/admin/user/get?username=e2e_admin", { cookie: admin })).json?.user?.id;
const forged = { "x-user-payload": JSON.stringify({ sub: adminId, sid: "x", username: "e2e_admin", role: "ADMIN" }) };
r = await call("GET", "/api/admin/user/get", { headers: forged });
check("forged header without cookie is rejected", r.status === 401, `${r.status}`);
r = await call("GET", "/api/admin/path-rules", { cookie: alice, headers: forged });
check("forged header cannot upgrade a USER", r.status === 403, `${r.status}`);
r = await call("GET", "/api/auth/user-check", { headers: forged });
check("forged header on open route is ignored", r.status === 401, `${r.status}`);

// --- tokens must match a live session ---
const secret = new TextEncoder().encode(envFile.JWT_SECRET);
const noSession = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(adminId).setJti("not-a-session")
    .setIssuedAt().setExpirationTime("1h").sign(secret);
r = await call("GET", "/api/admin/user/get", { cookie: `${cookieName}=${noSession}` });
check("valid JWT without a session row is rejected", r.status === 401, `${r.status}`);
const noJti = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(adminId).setIssuedAt().setExpirationTime("1h").sign(secret);
r = await call("GET", "/api/admin/user/get", { cookie: `${cookieName}=${noJti}` });
check("old-style JWT (no jti) is rejected", r.status === 401, `${r.status}`);

// --- logout revokes the session ---
const a1 = (await login("e2e_alice")).cookie;
r = await call("GET", "/api/files/list", { cookie: a1 });
check("fresh session works", r.status === 200, `${r.status}`);
r = await call("POST", "/api/auth/logout", { cookie: a1 });
check("logout ok", r.status === 200, `${r.status}`);
r = await call("GET", "/api/files/list", { cookie: a1 });
check("token is dead after logout", r.status === 401, `${r.status}`);

// --- admin-created user must change the temp password ---
r = await call("POST", "/api/admin/user/create", { cookie: admin, body: { username: "e2e_new", role: "USER" } });
const temp = r.json?.user?.tempPassword;
check("admin creates user with 16-char temp password", r.status === 201 && temp?.length === 16, `${r.status}`);
r = await call("POST", "/api/admin/user/create", { cookie: admin, body: { username: "bad name!", role: "USER" } });
check("invalid username rejected", r.status === 400, `${r.status}`);
r = await call("POST", "/api/admin/user/create", { cookie: admin, body: { username: "e2e_x", role: "ROOT" } });
check("invalid role rejected", r.status === 400, `${r.status}`);

let n = await login("e2e_new", temp);
check("login with temp password flags mustChangePassword", n.status === 200 && n.json?.mustChangePassword === true, `${n.status}`);
r = await call("GET", "/api/files/list", { cookie: n.cookie });
check("API blocked until password changed", r.status === 403 && r.json?.code === "PASSWORD_CHANGE_REQUIRED", `${r.status}`);
r = await call("POST", "/api/auth/password/old", { cookie: n.cookie, body: { oldPass: temp, newPass: "short" } });
check("weak new password rejected", r.status === 400, `${r.status} ${r.json?.error}`);
r = await call("POST", "/api/auth/password/old", { cookie: n.cookie, body: { oldPass: "wrong-password", newPass: "a-much-better-one" } });
check("wrong current password rejected", r.status === 400, `${r.status}`);
r = await call("POST", "/api/auth/password/old", { cookie: n.cookie, body: { oldPass: temp, newPass: "a-much-better-one", username: "e2e_admin" } });
check("password change ok (body username ignored)", r.status === 200, `${r.status} ${r.json?.error}`);
r = await call("GET", "/api/auth/user-check", { cookie: n.cookie });
check("session ended after password change", r.status === 401, `${r.status}`);
r = await login("e2e_admin");
check("admin password untouched", r.status === 200, `${r.status}`);
n = await login("e2e_new", "a-much-better-one");
check("new password works, no longer forced", n.status === 200 && n.json?.mustChangePassword === false, `${n.status}`);
r = await call("GET", "/api/files/list", { cookie: n.cookie });
check("API works after change", r.status === 200, `${r.status}`);
r = await call("POST", "/api/auth/password/old", { body: { username: "e2e_new", oldPass: "a-much-better-one", newPass: "hijacked-pass-1" } });
check("password change needs login", r.status === 401, `${r.status}`);

// --- password change logs out every device ---
const b1 = (await login("e2e_bob")).cookie;
const b2 = (await login("e2e_bob")).cookie;
r = await call("POST", "/api/auth/password/old", { cookie: b1, body: { oldPass: password, newPass: "bob-new-password" } });
check("bob changes password", r.status === 200, `${r.status}`);
r = await call("GET", "/api/files/list", { cookie: b2 });
check("bob's other device is logged out", r.status === 401, `${r.status}`);

// --- deleting a user kills their sessions ---
const g = (await login("e2e_guest")).cookie;
await call("DELETE", "/api/admin/user/delete", { cookie: admin, body: { username: "e2e_new" } });
r = await call("GET", "/api/files/list", { cookie: n.cookie });
check("deleted user's session is dead", r.status === 401, `${r.status}`);

// --- login rate limit ---
for (let i = 0; i < 5; i++) await login("e2e_guest", "wrong-" + i, "10.9.9.9");
r = await login("e2e_guest", password, "10.9.9.9");
check("6th attempt from same IP is throttled even with right password", r.status === 429, `${r.status} ${r.json?.error}`);
r = await login("e2e_guest", password, "10.8.8.8");
check("same user from another IP still works", r.status === 200, `${r.status}`);
r = await call("GET", "/api/files/list", { cookie: g });
check("existing guest session unaffected", r.status === 200, `${r.status}`);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
