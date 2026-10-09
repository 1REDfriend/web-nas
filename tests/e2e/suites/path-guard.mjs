// End-to-end checks for the path guard against a dev server on BASE_URL.
import fs from "fs";
import path from "path";

// Fixtures and generated settings, created by run-all.mjs (see fixtures.mjs)
const WORK = process.env.E2E_WORK_DIR;
if (!WORK) throw new Error("Run the suites with: npm run test:e2e");
const ROOT = path.join(WORK, "storage-root");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:47213";
const { password } = JSON.parse(fs.readFileSync(path.join(WORK, "creds.json"), "utf8"));

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
    const cookie = res.headers.get("set-cookie")?.split(";")[0];
    if (!res.ok || !cookie) throw new Error(`login ${username} failed: ${res.status}`);
    return cookie;
}

function api(cookie) {
    return async (method, url, body) => {
        const res = await fetch(BASE_URL + url, {
            method,
            headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try { json = await res.json(); } catch { /* binary */ }
        return { status: res.status, json };
    };
}

function q(params) {
    return new URLSearchParams(params).toString();
}

async function upload(cookie, currentPath, fileName, content) {
    const form = new FormData();
    form.append("currentPath", currentPath);
    form.append("file", new Blob([content]), fileName);
    const res = await fetch(`${BASE_URL}/api/files/upload`, { method: "POST", headers: { Cookie: cookie }, body: form });
    return { status: res.status, json: await res.json().catch(() => null) };
}

const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const admin = api(await login("e2e_admin"));
const alice = api(await login("e2e_alice"));
const guest = api(await login("e2e_guest"));
const aliceCookie = await login("e2e_alice");
const guestCookie = await login("e2e_guest");

// --- 1. The original exploit: permanent delete through "/trash/../.." ---
for (const evil of ["/trash/../../appdir", "/trash/../bob", "/trash/x/../../etc", "trash/../../../outside"]) {
    const r = await alice("POST", `/api/files/manage?${q({ file: evil, option: "delete", confirm: "true" })}`);
    check(`alice cannot delete via ${evil}`, r.status >= 400, `${r.status} ${r.json?.error}`);
}
check("appdir still exists", exists("appdir/.env"));
check("bob folder still exists", exists("bob/secret.txt"));
check("etc still exists", exists("etc/passwd"));

// --- 2. Ownership: alice only sees her assigned folder ---
let r = await alice("GET", `/api/files/read?${q({ file: "/bob/secret.txt" })}`);
check("alice cannot read bob's file", r.status === 403, `${r.status} ${r.json?.error}`);
r = await alice("GET", `/api/files/read?${q({ file: "/alice/doc.txt" })}`);
check("alice can read her file", r.status === 200 && r.json?.content === "alice doc", `${r.status}`);
r = await alice("GET", `/api/files/list?${q({ path: "/alice/../bob" })}`);
check("alice cannot list /alice/../bob", r.status === 403, `${r.status}`);
r = await alice("POST", "/api/files/download", { reqFile: "/appdir/.env" });
check("alice cannot download .env", r.status === 403, `${r.status}`);
r = await alice("GET", `/api/files/list?${q({ path: "/alice/link" })}`);
check("alice cannot follow symlink out of storage", r.status === 403, `${r.status} ${r.json?.error}`);
r = await alice("POST", `/api/files/manage?${q({ file: "/alice", option: "delete" })}`);
check("alice cannot delete her assigned root", r.status === 403, `${r.status} ${r.json?.error}`);
r = await alice("POST", `/api/files/manage?${q({ file: "/alice/doc.txt", option: "copy" })}`, { destination: "/bob" });
check("alice cannot copy into bob", r.status === 403, `${r.status}`);
r = await alice("POST", `/api/files/manage?${q({ file: "/bob/secret.txt", option: "cut" })}`, { destination: "/alice" });
check("alice cannot move bob's file", r.status === 403, `${r.status}`);
r = await alice("POST", `/api/files/manage?${q({ file: "/alice/doc.txt", option: "rename" })}`, { newName: "../escaped.txt" });
check("rename with ../ rejected", r.status === 400, `${r.status} ${r.json?.error}`);
r = await alice("POST", "/api/files/folder/create", { path: "/bob", name: "x" });
check("alice cannot create folder in bob", r.status === 403, `${r.status}`);

// --- 3. Upload ---
let u = await upload(aliceCookie, "/bob", "evil.txt", "x");
check("alice cannot upload into bob", u.status === 403 && !exists("bob/evil.txt"), `${u.status}`);
u = await upload(aliceCookie, "/alice", "../../etc/evil.txt", "x");
check("upload filename traversal stays in alice", u.status === 200 && exists("alice/evil.txt") && !exists("etc/evil.txt"), `${u.status} ${u.json?.filePath}`);

// --- 4. Trash still works ---
r = await alice("POST", `/api/files/manage?${q({ file: "/alice/keep.txt", option: "delete" })}`);
check("alice can move her file to trash", r.status === 200 && !exists("alice/keep.txt"), `${r.status} ${r.json?.error}`);
r = await alice("GET", `/api/files/list?${q({ path: "/trash" })}`);
const trashItem = r.json?.data?.find((f) => f.path.startsWith("/trash/keep.txt_id"));
check("trash lists the item", !!trashItem, `${r.status}`);
r = await alice("POST", `/api/files/manage?${q({ file: trashItem.path, option: "delete" })}`);
check("permanent delete asks for confirm", r.status === 409, `${r.status}`);
r = await alice("POST", `/api/files/manage?${q({ file: trashItem.path, option: "delete", confirm: "true" })}`);
check("permanent delete with confirm works", r.status === 200, `${r.status} ${r.json?.error}`);

// --- 5. Default rules ---
r = await admin("GET", `/api/files/read?${q({ file: "/etc/passwd" })}`);
check("admin can view /etc (default rule allows view)", r.status === 200, `${r.status}`);
r = await admin("POST", `/api/files/manage?${q({ file: "/etc/passwd", option: "delete" })}`);
check("admin cannot delete in /etc (default rule)", r.status === 403 && exists("etc/passwd"), `${r.status} ${r.json?.error}`);
r = await admin("POST", `/api/files/manage?${q({ file: "/", option: "delete" })}`);
check("admin cannot delete storage root", r.status === 403, `${r.status}`);
r = await admin("POST", "/api/files/download", { reqFile: "/" });
check("admin cannot zip a folder containing protected paths", r.status === 403, `${r.status} ${r.json?.error}`);
r = await admin("POST", `/api/files/manage?${q({ file: "/appdir", option: "delete" })}`);
check("admin cannot delete system-protected appdir", r.status === 403 && exists("appdir/.env"), `${r.status}`);
r = await admin("GET", `/api/files/read?${q({ file: "/internal-store/x" })}`);
check("admin cannot read internal storage", r.status === 403, `${r.status}`);
r = await guest("GET", `/api/files/read?${q({ file: "/shared/readme.txt" })}`);
check("guest can read assigned folder", r.status === 200, `${r.status}`);
u = await upload(guestCookie, "/shared", "g.txt", "x");
check("guest cannot upload (read-only default)", u.status === 403 && !exists("shared/g.txt"), `${u.status} ${u.json?.error}`);

// --- 6. Admin-managed rules ---
r = await alice("GET", "/api/admin/path-rules");
check("non-admin cannot read rules", r.status === 403, `${r.status}`);
r = await admin("GET", "/api/admin/path-rules");
check("admin lists default rules", r.status === 200 && r.json.rules.length > 40, `${r.status} ${r.json?.rules?.length}`);
r = await admin("POST", "/api/admin/path-rules", { path: "/alice/sub/inner", role: "USER", actions: ["DELETE"], recursive: true, note: "e2e" });
check("admin creates rule", r.status === 200, `${r.status} ${r.json?.error}`);
const ruleId = r.json?.rule?.id;
r = await alice("POST", `/api/files/manage?${q({ file: "/alice/sub/inner/note.txt", option: "delete" })}`);
check("rule blocks delete inside protected folder", r.status === 403 && exists("alice/sub/inner/note.txt"), `${r.status} ${r.json?.error}`);
r = await alice("POST", `/api/files/manage?${q({ file: "/alice/sub", option: "delete" })}`);
check("rule blocks deleting the parent", r.status === 403 && exists("alice/sub"), `${r.status} ${r.json?.error}`);
r = await alice("GET", `/api/files/read?${q({ file: "/alice/sub/inner/note.txt" })}`);
check("rule leaves other actions alone", r.status === 200, `${r.status}`);
r = await admin("POST", `/api/files/manage?${q({ file: "/alice/sub/inner/note.txt", option: "delete" })}`);
check("rule for USER does not affect ADMIN", r.status === 200, `${r.status} ${r.json?.error}`);
r = await admin("DELETE", `/api/admin/path-rules?${q({ id: ruleId })}`);
check("admin removes rule", r.status === 200, `${r.status}`);
r = await alice("POST", `/api/files/manage?${q({ file: "/alice/sub", option: "delete" })}`);
check("after removal alice can delete", r.status === 200, `${r.status} ${r.json?.error}`);

const etcRule = (await admin("GET", "/api/admin/path-rules")).json.rules.find((x) => x.path === "/etc" && x.role === "ADMIN");
await admin("DELETE", `/api/admin/path-rules?${q({ id: etcRule.id })}`);
let rules = (await admin("GET", "/api/admin/path-rules")).json.rules;
check("deleted default stays deleted", !rules.some((x) => x.path === "/etc" && x.role === "ADMIN"));
r = await admin("POST", "/api/admin/path-rules/reset");
rules = (await admin("GET", "/api/admin/path-rules")).json.rules;
check("restore defaults brings it back", r.status === 200 && rules.some((x) => x.path === "/etc" && x.role === "ADMIN"));

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
