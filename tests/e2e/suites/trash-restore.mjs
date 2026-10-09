// Restoring items from the trash.
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
const q = (p) => new URLSearchParams(p).toString();
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const alice = api(await login("e2e_alice"));
const bob = api(await login("e2e_bob"));
const admin = api(await login("e2e_admin"));
const aliceId = (await admin("GET", "/api/admin/user/get?username=e2e_alice")).json.user.id;
const trashDir = path.join(env.STORAGE_INTERNAL, aliceId, "trash");

const del = (p) => alice("POST", `/api/files/manage?${q({ file: p, option: "delete" })}`);
const restore = (who, p) => who("POST", `/api/files/manage?${q({ file: p, option: "restore" })}`);
async function trashItem(name) {
    const r = await alice("GET", `/api/files/list?${q({ path: "/trash" })}`);
    return r.json.data.find((f) => f.name === name);
}

// --- basic restore ---
await del("/alice/doc.txt");
let item = await trashItem("doc.txt");
check("trash shows the original name", !!item && item.path.startsWith("/trash/doc.txt_id"), item?.path);
check("trash shows where it came from", item?.originalPath === "/alice/doc.txt", item?.originalPath);
const days = (new Date(item?.expiresAt) - Date.now()) / 86400000;
check("trash shows when it is purged (~30 days)", days > 29 && days <= 30, days.toFixed(2));

let r = await restore(alice, item.path);
check("restore returns to the original path", r.status === 200 && r.json.newPath === "/alice/doc.txt", `${r.status} ${r.json?.error ?? r.json?.newPath}`);
check("file is back with its content", exists("alice/doc.txt") && read("alice/doc.txt") === "alice doc");
check("item left the trash", !(await trashItem("doc.txt")));
check("trash record removed", (await prisma.trashShedule.count({ where: { userId: aliceId } })) === 0);
r = await alice("GET", `/api/files/list?${q({ view: "recent" })}`);
check("restored file shows in Recent", r.json.data[0]?.path === "/alice/doc.txt", r.json.data[0]?.path);

// --- name collisions never overwrite ---
await del("/alice/keep.txt");
fs.writeFileSync(path.join(ROOT, "alice", "keep.txt"), "new keep");
r = await restore(alice, (await trashItem("keep.txt")).path);
check("collision restores under a new name", r.json?.newPath === "/alice/keep (restored).txt", r.json?.newPath ?? r.json?.error);
check("existing file untouched", read("alice/keep.txt") === "new keep" && read("alice/keep (restored).txt") === "keep");
await del("/alice/keep (restored).txt");
await del("/alice/keep.txt");
fs.writeFileSync(path.join(ROOT, "alice", "keep.txt"), "third");
fs.writeFileSync(path.join(ROOT, "alice", "keep (restored).txt"), "taken");
const keeps = (await alice("GET", `/api/files/list?${q({ path: "/trash" })}`)).json.data.filter((f) => f.name === "keep.txt");
r = await restore(alice, keeps[0].path);
check("second collision gets a numbered name", r.json?.newPath === "/alice/keep (restored 2).txt", r.json?.newPath ?? r.json?.error);

// --- folders, and a missing original folder ---
await del("/alice/pics");
r = await restore(alice, (await trashItem("pics")).path);
check("folder restored with its contents", r.status === 200 && exists("alice/pics/a.txt") && exists("alice/pics/deep/b.txt"), `${r.status}`);

await del("/alice/sub/inner/note.txt");
await del("/alice/sub");
r = await restore(alice, (await trashItem("note.txt")).path);
check("missing original folder is recreated", r.status === 200 && read("alice/sub/inner/note.txt") === "inner", `${r.status} ${r.json?.error}`);

// --- permissions are checked again at restore time ---
await del("/alice/doc.txt");
const rule = await admin("POST", "/api/admin/path-rules", { path: "/alice", role: "USER", actions: ["UPLOAD"], recursive: true });
r = await restore(alice, (await trashItem("doc.txt")).path);
check("restore refused when writing there is no longer allowed", r.status === 403 && !exists("alice/doc.txt"), `${r.status} ${r.json?.error}`);
check("refused item stays in the trash", !!(await trashItem("doc.txt")));
await admin("DELETE", `/api/admin/path-rules?${q({ id: rule.json.rule.id })}`);

// --- isolation and tampering ---
const docPath = (await trashItem("doc.txt")).path;
r = await restore(bob, docPath);
check("another user cannot restore it", r.status === 404 && !exists("alice/doc.txt"), `${r.status}`);
for (const evil of ["/trash/../alice/pics/a.txt", `/trash/x/../../${docPath.slice(7)}`, "/alice/pics/a.txt"]) {
    r = await restore(alice, evil);
    check(`not a trash item: ${evil}`, r.status === 400, `${r.status} ${r.json?.error}`);
}
const bobRecord = await prisma.trashShedule.create({
    data: { userId: (await admin("GET", "/api/admin/user/get?username=e2e_bob")).json.user.id, item: "x.txt", returnPath: "/nowhere", originalPath: "/bob/x.txt", expireDate: new Date(Date.now() + 86400000) },
});
fs.writeFileSync(path.join(trashDir, `x.txt_id${bobRecord.id}`), "planted");
r = await restore(alice, `/trash/x.txt_id${bobRecord.id}`);
check("planted file pointing at another user's record is refused", r.status === 404 && !exists("bob/x.txt"), `${r.status}`);

r = await restore(alice, docPath);
check("owner can restore it", r.status === 200 && exists("alice/doc.txt"), `${r.status}`);

// --- records written before originalPath existed ---
const legacy = await prisma.trashShedule.create({
    data: { userId: aliceId, item: "legacy.txt", returnPath: path.join(fs.realpathSync(ROOT), "alice", "legacy.txt"), expireDate: new Date(Date.now() + 86400000) },
});
fs.writeFileSync(path.join(trashDir, `legacy.txt_id${legacy.id}`), "old record");
item = await trashItem("legacy.txt");
check("legacy record shows its origin", item?.originalPath === "/alice/legacy.txt", item?.originalPath);
r = await restore(alice, item.path);
check("legacy record restores", r.status === 200 && read("alice/legacy.txt") === "old record", `${r.status} ${r.json?.error}`);

await prisma.$disconnect();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
