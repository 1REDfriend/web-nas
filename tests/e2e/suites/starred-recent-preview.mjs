// Starred / Recent views and bounded previews.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Fixtures and generated settings, created by run-all.mjs (see fixtures.mjs)
const WORK = process.env.E2E_WORK_DIR;
if (!WORK) throw new Error("Run the suites with: npm run test:e2e");
const PROJECT = path.resolve(HERE, "..", "..", "..");
const ROOT = path.join(WORK, "storage-root");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:47213";
const { password } = JSON.parse(fs.readFileSync(path.join(WORK, "creds.json"), "utf8"));

const req = createRequire(path.join(PROJECT, "package.json"));
process.env.DATABASE_URL = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8")).DATABASE_URL;
const { PrismaClient } = req("@prisma/client");
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
    return res.headers.get("set-cookie").split(";")[0];
}
function api(cookie) {
    return async (method, url, body) => {
        const res = await fetch(BASE_URL + url, {
            method,
            headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const buf = Buffer.from(await res.arrayBuffer());
        let json = null;
        try { json = JSON.parse(buf.toString("utf8")); } catch { /* binary */ }
        return { status: res.status, json };
    };
}
const q = (p) => new URLSearchParams(p).toString();
const names = (r) => (r.json?.data ?? []).map((f) => f.path);

const alice = api(await login("e2e_alice"));
const bob = api(await login("e2e_bob"));
const admin = api(await login("e2e_admin"));
const aliceId = (await admin("GET", "/api/admin/user/get?username=e2e_alice")).json.user.id;

// --- Starred ---
await alice("POST", `/api/files/star?${q({ path: "/alice/pics/a.txt" })}`);
await alice("POST", `/api/files/star?${q({ path: "/alice/sub" })}`);
let r = await alice("GET", `/api/files/list?${q({ path: "/alice/pics" })}`);
check("folder listing marks starred files", r.json.data.find((f) => f.name === "a.txt")?.isStarred === true);
check("unstarred files stay unstarred", r.json.data.find((f) => f.name === "deep")?.isStarred === false);

r = await alice("GET", `/api/files/list?${q({ view: "starred" })}`);
check("Starred view lists stars from every folder", names(r).includes("/alice/pics/a.txt") && names(r).includes("/alice/sub"), names(r).join(","));
r = await bob("GET", `/api/files/list?${q({ view: "starred" })}`);
check("other users' stars are not shown", names(r).length === 0, names(r).join(","));

await alice("POST", `/api/files/manage?${q({ file: "/alice/pics/a.txt", option: "rename" })}`, { newName: "a-renamed.txt" });
r = await alice("GET", `/api/files/list?${q({ view: "starred" })}`);
check("star follows a rename", names(r).includes("/alice/pics/a-renamed.txt") && !names(r).includes("/alice/pics/a.txt"), names(r).join(","));

await alice("POST", `/api/files/star?${q({ path: "/alice/sub/inner/note.txt" })}`);
await alice("POST", `/api/files/manage?${q({ file: "/alice/sub", option: "cut" })}`, { destination: "/alice/pics" });
r = await alice("GET", `/api/files/list?${q({ view: "starred" })}`);
check("stars inside a moved folder follow it",
    names(r).includes("/alice/pics/sub") && names(r).includes("/alice/pics/sub/inner/note.txt"), names(r).join(","));

await alice("POST", `/api/files/manage?${q({ file: "/alice/pics/a-renamed.txt", option: "delete" })}`);
r = await alice("GET", `/api/files/list?${q({ view: "starred" })}`);
check("trashed file drops out of Starred", !names(r).some((p) => p.includes("a-renamed")), names(r).join(","));

// --- Recent ---
await alice("GET", `/api/files/read?${q({ file: "/alice/keep.txt", option: "preview" })}`);
r = await alice("GET", `/api/files/list?${q({ view: "recent" })}`);
check("preview does not count as recent", !names(r).includes("/alice/keep.txt"), names(r).join(","));

await alice("POST", "/api/files/download", { reqFile: "/alice/doc.txt" });
r = await alice("GET", `/api/files/list?${q({ view: "recent" })}`);
check("download shows up first in Recent", names(r)[0] === "/alice/doc.txt", names(r).slice(0, 3).join(","));
await alice("GET", `/api/files/read?${q({ file: "/alice/keep.txt" })}`);
r = await alice("GET", `/api/files/list?${q({ view: "recent" })}`);
check("opening a file moves it to the top", names(r)[0] === "/alice/keep.txt" && names(r)[1] === "/alice/doc.txt", names(r).slice(0, 3).join(","));
check("moved folder appears in Recent", names(r).includes("/alice/pics/sub"), names(r).join(","));

for (let i = 0; i < 55; i++) await alice("POST", "/api/files/folder/create", { path: "/alice", name: `bulk${i}` });
const count = await prisma.recentItem.count({ where: { userId: aliceId } });
check("Recent keeps at most 50 items", count === 50, String(count));
r = await alice("GET", `/api/files/list?${q({ view: "recent" })}`);
check("newest item is first", names(r)[0] === "/alice/bulk54", names(r)[0]);

const rule = await admin("POST", "/api/admin/path-rules", { path: "/alice/bulk54", role: "USER", actions: ["VIEW"], recursive: true });
r = await alice("GET", `/api/files/list?${q({ view: "recent" })}`);
check("items the user may no longer view are hidden", !names(r).includes("/alice/bulk54"), names(r)[0]);
await admin("DELETE", `/api/admin/path-rules?${q({ id: rule.json.rule.id })}`);

// --- Bounded preview ---
const big = path.join(ROOT, "alice", "big.log");
const line = "0123456789".repeat(10) + "\n";
fs.writeFileSync(big, line.repeat(500_000)); // ~50 MB
fs.writeFileSync(path.join(ROOT, "alice", "blob.bin"), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x41]));

let t = Date.now();
r = await alice("GET", `/api/files/read?${q({ file: "/alice/big.log", option: "preview" })}`);
const ms = Date.now() - t;
check("preview of a 50 MB file returns the first lines", r.status === 200 && r.json.content.startsWith(line) && r.json.content.length <= 1000 && r.json.size > 49_000_000, `${r.status}`);
check("preview of a 50 MB file is fast", ms < 1500, `${ms} ms`);
r = await alice("GET", `/api/files/read?${q({ file: "/alice/blob.bin", option: "preview" })}`);
check("binary file has no text preview", r.status === 200 && r.json.content === null, `${r.status}`);
r = await alice("GET", `/api/files/read?${q({ file: "/alice/big.log" })}`);
check("full read of a huge file is refused", r.status === 413, `${r.status}`);

await prisma.$disconnect();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
