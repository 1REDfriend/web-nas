// Checks the endpoint Caddy's forward_auth calls before every web-terminal request.
import fs from "fs";
import path from "path";

// Fixtures and generated settings, created by run-all.mjs (see fixtures.mjs)
const WORK = process.env.E2E_WORK_DIR;
if (!WORK) throw new Error("Run the suites with: npm run test:e2e");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:47213";
const { password } = JSON.parse(fs.readFileSync(path.join(WORK, "creds.json"), "utf8"));

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function login(username, pw = password) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: pw }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

// Mimics what forward_auth sends: a GET with the browser's headers (cookie included)
async function terminalCheck(cookie, extra = {}) {
    const res = await fetch(`${BASE_URL}/api/auth/terminal-check`, {
        headers: { ...(cookie ? { Cookie: cookie } : {}), "X-Forwarded-Method": "GET", "X-Forwarded-Uri": "/ws?id=1", ...extra },
    });
    return res.status;
}

const admin = await login("e2e_admin");
const alice = await login("e2e_alice");
const guest = await login("e2e_guest");

check("ADMIN may open the terminal", (await terminalCheck(admin)) === 204);
check("USER is refused", (await terminalCheck(alice)) === 403);
check("GUEST is refused", (await terminalCheck(guest)) === 403);
check("no cookie is refused", (await terminalCheck(null)) === 401);

const adminId = (await (await fetch(`${BASE_URL}/api/admin/user/get?username=e2e_admin`, { headers: { Cookie: admin } })).json()).user.id;
const forged = { "x-user-payload": JSON.stringify({ sub: adminId, sid: "x", username: "e2e_admin", role: "ADMIN" }) };
check("forged identity header is refused", (await terminalCheck(null, forged)) === 401);
check("USER with forged header is still refused", (await terminalCheck(alice, forged)) === 403);

const admin2 = await login("e2e_admin");
await fetch(`${BASE_URL}/api/auth/logout`, { method: "POST", headers: { Cookie: admin2 } });
check("logged-out token is refused", (await terminalCheck(admin2)) === 401);

const created = await (await fetch(`${BASE_URL}/api/admin/user/create`, {
    method: "POST",
    headers: { Cookie: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "e2e_newadmin", role: "ADMIN" }),
})).json();
const fresh = await login("e2e_newadmin", created.user.tempPassword);
check("new ADMIN with temp password is refused until it is changed", (await terminalCheck(fresh)) === 401);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
