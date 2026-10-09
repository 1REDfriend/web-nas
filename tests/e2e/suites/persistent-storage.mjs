// Writes must stay on persistent storage (STORAGE_WRITABLE_PATHS = alice, bob, shared).
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
const env = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8"));

const req = createRequire(path.join(PROJECT, "package.json"));
process.env.DATABASE_URL = env.DATABASE_URL;
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
        return { status: res.status, json: await res.json().catch(() => null) };
    };
}
async function upload(cookie, currentPath, name, content) {
    const form = new FormData();
    form.append("currentPath", currentPath);
    form.append("file", new Blob([content]), name);
    const res = await fetch(`${BASE_URL}/api/files/upload`, { method: "POST", headers: { Cookie: cookie }, body: form });
    return { status: res.status, json: await res.json().catch(() => null) };
}
const q = (p) => new URLSearchParams(p).toString();
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const manage = (who, file, option, body) => who("POST", `/api/files/manage?${q({ file, option })}`, body);

const adminCookie = await login("e2e_admin");
const aliceCookie = await login("e2e_alice");
const admin = api(adminCookie);
const alice = api(aliceCookie);

// --- writes outside persistent storage are refused, with a clear reason ---
let r = await upload(adminCookie, "/", "lost.txt", "x");
check("upload to / refused", r.status === 403 && !exists("lost.txt"), `${r.status}`);
check("message explains why", /persistent storage \(\/alice, \/bob, \/shared\)/.test(r.json?.error ?? ""), r.json?.error);
r = await admin("POST", "/api/files/folder/create", { path: "/", name: "newroot" });
check("new folder outside storage refused", r.status === 403 && !exists("newroot"), `${r.status}`);
r = await admin("POST", "/api/files/import", { virtualPath: "/scratch" });
check("admin root path outside storage refused", r.status === 403 && !exists("scratch"), `${r.status} ${r.json?.error}`);
r = await manage(admin, "/alice/doc.txt", "copy", { destination: "/" });
check("copy out of storage refused", r.status === 403 && !exists("doc.txt"), `${r.status}`);
r = await manage(admin, "/alice/keep.txt", "cut", { destination: "/etc" });
check("move out of storage refused", r.status === 403 && exists("alice/keep.txt"), `${r.status}`);

// --- the storage folders themselves are untouchable ---
r = await manage(admin, "/alice", "delete");
check("storage folder cannot be deleted", r.status === 403 && exists("alice/doc.txt"), `${r.status} ${r.json?.error}`);
r = await manage(admin, "/shared", "rename", { newName: "x" });
check("storage folder cannot be renamed", r.status === 403 && exists("shared"), `${r.status}`);
r = await manage(admin, "/bob", "cut", { destination: "/alice" });
check("storage folder cannot be moved", r.status === 403 && exists("bob/secret.txt"), `${r.status}`);

// --- normal work inside storage still works ---
r = await admin("POST", "/api/files/import", { virtualPath: "/alice/project" });
check("admin root path inside storage works", r.status === 200 && exists("alice/project"), `${r.status} ${r.json?.error}`);
check("assignment stored as a normal path", (await prisma.pathMap.count({ where: { rootPath: "/alice/project" } })) === 1);
r = await manage(admin, "/alice/keep.txt", "cut", { destination: "/bob" });
check("move between storage folders works", r.status === 200 && exists("bob/keep.txt"), `${r.status}`);
r = await upload(aliceCookie, "/alice", "mine.txt", "x");
check("users still upload into their folders", r.status === 200 && exists("alice/mine.txt"), `${r.status}`);
r = await admin("GET", `/api/files/read?${q({ file: "/etc/passwd" })}`);
check("reading outside storage still works", r.status === 200, `${r.status}`);

// --- restore cannot write outside storage either ---
const aliceId = (await admin("GET", "/api/admin/user/get?username=e2e_alice")).json.user.id;
const record = await prisma.trashShedule.create({
    data: { userId: aliceId, item: "stray.txt", returnPath: "/x", originalPath: "/stray.txt", expireDate: new Date(Date.now() + 86400000) },
});
fs.mkdirSync(path.join(env.STORAGE_INTERNAL, aliceId, "trash"), { recursive: true });
fs.writeFileSync(path.join(env.STORAGE_INTERNAL, aliceId, "trash", `stray.txt_id${record.id}`), "x");
r = await manage(alice, `/trash/stray.txt_id${record.id}`, "restore");
check("restore to a non-storage location refused", r.status === 403 && !exists("stray.txt"), `${r.status} ${r.json?.error}`);

await prisma.$disconnect();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
