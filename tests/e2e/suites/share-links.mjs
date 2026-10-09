// End-to-end checks for public share links against the dev server on BASE_URL.
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
            headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const buf = Buffer.from(await res.arrayBuffer());
        let json = null;
        try { json = JSON.parse(buf.toString("utf8")); } catch { /* binary */ }
        return { status: res.status, json, buf, headers: res.headers };
    };
}

const q = (p) => new URLSearchParams(p).toString();
const anon = api(null);
const alice = api(await login("e2e_alice"));
const bob = api(await login("e2e_bob"));
const admin = api(await login("e2e_admin"));

async function share(pathArg, extra = {}) {
    const r = await alice("POST", "/api/user/share", { path: pathArg, ...extra });
    const id = r.json?.url?.split("/").pop();
    return { r, id };
}
const list = (id, p = "/") => anon("GET", `/api/public/share/${id}?${q({ path: p })}`);
const dl = (id, p = "/") => anon("GET", `/api/public/share/${id}/download?${q({ path: p })}`);

// --- create ---
let { r, id } = await share("/alice/pics");
check("create share returns /share/<id>", r.status === 200 && r.json.url === `/share/${id}`, `${r.status} ${r.json?.url}`);
check("share id is long and random", typeof id === "string" && id.length >= 20, id);
const days = (new Date(r.json?.expireAt) - Date.now()) / 86400000;
check("default expiry is about 3 days", days > 2.9 && days <= 3.01, days.toFixed(3));

r = await alice("POST", "/api/user/share", { path: "/alice/pics", expireAt: "2000-01-01" });
check("expiry in the past rejected", r.status === 400, `${r.status} ${r.json?.error}`);
r = await alice("POST", "/api/user/share", { path: "/bob" });
check("cannot share someone else's folder", r.status === 403, `${r.status}`);

// --- non-recursive folder share, no login ---
r = await list(id);
const names = (r.json?.data ?? []).map((f) => f.name);
check("anonymous visitor can list share", r.status === 200 && names.includes("a.txt"), `${r.status} ${names}`);
check("non-recursive hides subfolders", !names.includes("deep"), `${names}`);
r = await dl(id, "/a.txt");
check("anonymous download of shared file", r.status === 200 && r.buf.toString() === "file a", `${r.status}`);
r = await dl(id, "/deep/b.txt");
check("non-recursive blocks nested file", r.status === 404, `${r.status}`);
r = await list(id, "/deep");
check("non-recursive blocks listing subfolder", r.status === 404, `${r.status}`);
r = await dl(id, "/");
check("zip of non-recursive share has top files only",
    r.status === 200 && r.buf.includes(Buffer.from("a.txt")) && !r.buf.includes(Buffer.from("b.txt")), `${r.status} ${r.buf.length}b`);

// --- escape attempts ---
for (const evil of ["/../doc.txt", "/../../bob/secret.txt", "../../../appdir/.env", "/..%2F..%2Fbob/secret.txt", "\\..\\..\\bob\\secret.txt"]) {
    r = await dl(id, evil);
    const leaked = r.buf.includes(Buffer.from("bob secret")) || r.buf.includes(Buffer.from("alice doc")) || r.buf.includes(Buffer.from("JWT_SECRET"));
    check(`no escape via ${evil}`, r.status >= 400 && !leaked, `${r.status} ${r.json?.error}`);
}
r = await anon("GET", `/api/public/share/..%2F..%2Fx`);
check("malformed id rejected", r.status === 404, `${r.status}`);
r = await anon("GET", `/api/public/share/AAAAAAAAAAAAAAAAAAAAAAAA`);
check("unknown id is 404", r.status === 404, `${r.status}`);
r = await anon("POST", "/api/files/download?share=true", { id, reqFile: "/a.txt" });
check("old share download path needs login", r.status === 401, `${r.status}`);

// --- recursive share ---
const rec = await share("/alice/pics", { recursive: true });
r = await list(rec.id, "/deep");
check("recursive share lists subfolder", r.status === 200 && r.json.data.some((f) => f.name === "b.txt"), `${r.status}`);
r = await dl(rec.id, "/deep/b.txt");
check("recursive share downloads nested file", r.status === 200 && r.buf.toString() === "file b", `${r.status}`);

// --- single file share ---
const single = await share("/alice/doc.txt");
r = await list(single.id);
check("single-file share lists the file", r.status === 200 && r.json.data.length === 1 && r.json.data[0].name === "doc.txt", `${r.status}`);
r = await dl(single.id, "/");
check("single-file share downloads", r.status === 200 && r.buf.toString() === "alice doc", `${r.status}`);
r = await dl(single.id, "/../keep.txt");
check("single-file share exposes nothing else", r.status === 404, `${r.status}`);

// --- symlink inside a shared folder ---
const withLink = await share("/alice", { recursive: true });
r = await list(withLink.id, "/link");
check("cannot browse symlink out of storage", r.status === 404, `${r.status}`);
r = await dl(withLink.id, "/link/outside.txt");
check("cannot download through symlink", r.status === 404 && !r.buf.includes(Buffer.from("outside")), `${r.status}`);
r = await dl(withLink.id, "/");
check("zip does not include symlink target content", r.status === 200 && !r.buf.includes(Buffer.from("outside.txt")), `${r.status} ${r.buf.length}b`);

// --- owner loses permission -> link stops working ---
r = await admin("POST", "/api/admin/path-rules", { path: "/alice/pics", role: "USER", actions: ["SHARE"], recursive: true });
const ruleId = r.json?.rule?.id;
r = await list(id);
check("link stops when owner may no longer share", r.status === 403 && r.json?.error === "This share link is no longer available", `${r.status} ${r.json?.error}`);
r = await alice("GET", "/api/user/share");
check("owner list marks it Unavailable", r.json?.share?.find((s) => s.id === id)?.status === "Unavailable");
await admin("DELETE", `/api/admin/path-rules?${q({ id: ruleId })}`);
r = await list(id);
check("link works again after rule removed", r.status === 200, `${r.status}`);

// --- expiry ---
const shortLived = await share("/alice/pics", { expireAt: new Date(Date.now() + 1500).toISOString() });
r = await list(shortLived.id);
check("short-lived link works before expiry", r.status === 200, `${r.status}`);
await new Promise((res) => setTimeout(res, 2500));
r = await list(shortLived.id);
check("expired link returns 410", r.status === 410, `${r.status} ${r.json?.error}`);
r = await dl(shortLived.id, "/a.txt");
check("expired link cannot download", r.status === 410, `${r.status}`);
r = await alice("GET", "/api/user/share");
const mine = r.json?.share ?? [];
check("owner list shows Expired + expiresAt", mine.find((s) => s.id === shortLived.id)?.status === "Expired" && !!mine[0]?.expiresAt);

// --- revoke ---
r = await bob("DELETE", `/api/user/share?${q({ id })}`);
check("other user cannot revoke", r.status === 404, `${r.status}`);
r = await alice("DELETE", `/api/user/share?${q({ id })}`);
check("owner revokes", r.status === 200, `${r.status}`);
r = await list(id);
check("revoked link is 404", r.status === 404, `${r.status}`);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
