// Searching through subfolders.
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
    return res.headers.get("set-cookie").split(";")[0];
}
async function search(cookie, params) {
    const res = await fetch(`${BASE_URL}/api/files/list?${new URLSearchParams({ deep: "1", ...params })}`, { headers: { Cookie: cookie } });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, paths: (json?.data ?? []).map((f) => f.path) };
}

const alice = await login("e2e_alice");
const admin = await login("e2e_admin");

// --- finds things below the current folder ---
let r = await search(alice, { path: "/alice", search: "b.txt" });
check("finds a file two levels down", r.paths.includes("/alice/pics/deep/b.txt"), r.paths.join(","));
check("result says which folder it is in", r.json.data.find((f) => f.name === "b.txt")?.folder === "/alice/pics/deep");
r = await search(alice, { path: "/alice", search: "B.TXT" });
check("case-insensitive", r.paths.includes("/alice/pics/deep/b.txt"));
r = await search(alice, { path: "/alice", search: "deep" });
check("matches folders too", r.paths.includes("/alice/pics/deep"), r.paths.join(","));
r = await search(alice, { search: "note" });
check("from the home page it searches every assigned folder", r.paths.includes("/alice/sub/inner/note.txt"), r.paths.join(","));
const plain = await fetch(`${BASE_URL}/api/files/list?${new URLSearchParams({ path: "/alice", search: "b.txt" })}`, { headers: { Cookie: alice } }).then((x) => x.json());
check("without deep=1 only the current folder is searched", plain.data.length === 0);

// --- never shows what the user may not see ---
r = await search(alice, { search: "secret" });
check("other users' files are not found", r.paths.length === 0, r.paths.join(","));
r = await search(alice, { path: "/bob", search: "secret" });
check("searching someone else's folder is refused", r.status === 403, `${r.status}`);
r = await search(admin, { path: "/", search: ".env" });
check("system-protected files never appear", !r.paths.some((p) => p.includes("appdir")), r.paths.join(","));
r = await search(admin, { path: "/", search: "passwd" });
check("admin can search outside assigned folders", r.paths.includes("/etc/passwd"), r.paths.join(","));
r = await search(alice, { path: "/alice", search: "outside" });
check("symlinks out of storage are not followed", r.paths.length === 0, r.paths.join(","));

const rule = await fetch(`${BASE_URL}/api/admin/path-rules`, {
    method: "POST",
    headers: { Cookie: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/alice/pics", role: "USER", actions: ["VIEW"], recursive: true }),
}).then((x) => x.json());
r = await search(alice, { path: "/alice", search: "b.txt" });
check("folders blocked by a VIEW rule are skipped", r.paths.length === 0, r.paths.join(","));
await fetch(`${BASE_URL}/api/admin/path-rules?id=${rule.rule.id}`, { method: "DELETE", headers: { Cookie: admin } });

// --- stars and limits ---
await fetch(`${BASE_URL}/api/files/star?path=${encodeURIComponent("/alice/pics/a.txt")}`, { method: "POST", headers: { Cookie: alice } });
r = await search(alice, { path: "/alice", search: "a.txt" });
check("starred results are marked", r.json.data.find((f) => f.path === "/alice/pics/a.txt")?.isStarred === true);

const many = path.join(ROOT, "alice", "many");
fs.mkdirSync(many, { recursive: true });
for (let i = 0; i < 250; i++) fs.writeFileSync(path.join(many, `match-${i}.txt`), "");
r = await search(alice, { path: "/alice", search: "match-" });
check("stops at 200 matches and says so", r.paths.length === 200 && r.json.meta.truncated === true, `${r.paths.length} truncated=${r.json.meta.truncated}`);
r = await search(alice, { path: "/alice", search: "match-249" });
check("a precise search is not truncated", r.paths.length === 1 && r.json.meta.truncated === false, `${r.paths.length}`);

r = await search(alice, { path: "/trash", search: "x" });
check("trash search still works (current folder only)", r.status === 200, `${r.status}`);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
