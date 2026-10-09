// Emptying the trash.
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
const OUTSIDE = path.join(WORK, "outside");
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
const manage = async (cookie, params) => {
    const res = await fetch(`${BASE_URL}/api/files/manage?${new URLSearchParams(params)}`, {
        method: "POST",
        headers: cookie ? { Cookie: cookie } : {},
    });
    return { status: res.status, json: await res.json().catch(() => null) };
};
const exists = (p) => fs.existsSync(p);

const alice = await login("e2e_alice");
const bob = await login("e2e_bob");
const admin = await login("e2e_admin");
const idOf = async (u) => (await fetch(`${BASE_URL}/api/admin/user/get?username=${u}`, { headers: { Cookie: admin } }).then((x) => x.json())).user.id;
const aliceTrash = path.join(env.STORAGE_INTERNAL, await idOf("e2e_alice"), "trash");
const bobId = await idOf("e2e_bob");

for (const f of ["/alice/doc.txt", "/alice/keep.txt", "/alice/pics"]) await manage(alice, { file: f, option: "delete" });
await manage(bob, { file: "/bob/secret.txt", option: "delete" });
fs.symlinkSync(OUTSIDE, path.join(aliceTrash, "link-to-outside"), "junction");
const aliceItems = fs.readdirSync(aliceTrash).length;
check("alice has 3 items plus a planted symlink in her trash", aliceItems === 4, String(aliceItems));

let r = await manage(alice, { file: "/trash", option: "empty" });
check("refused without confirm", r.status === 409 && fs.readdirSync(aliceTrash).length === 4, `${r.status}`);
for (const f of ["/alice", "/trash/doc.txt", "/trash/../alice"]) {
    r = await manage(alice, { file: f, option: "empty", confirm: "true" });
    check(`only /trash can be emptied: ${f}`, r.status === 400 && exists(path.join(ROOT, "alice", "sub")), `${r.status}`);
}
r = await manage(null, { file: "/trash", option: "empty", confirm: "true" });
check("no login -> 401", r.status === 401, `${r.status}`);

r = await manage(alice, { file: "/trash", option: "empty", confirm: "true" });
check("empty with confirm works", r.status === 200 && r.json.removed === 4, `${r.status} removed=${r.json?.removed}`);
check("alice's trash folder is empty", fs.readdirSync(aliceTrash).length === 0);
check("alice's trash records are gone", (await prisma.trashShedule.count({ where: { userId: await idOf("e2e_alice") } })) === 0);
check("symlink target was not touched", exists(path.join(OUTSIDE, "outside.txt")));
check("bob's trash is untouched", (await prisma.trashShedule.count({ where: { userId: bobId } })) === 1
    && fs.readdirSync(path.join(env.STORAGE_INTERNAL, bobId, "trash")).length === 1);
check("files outside the trash untouched", exists(path.join(ROOT, "alice", "sub", "inner", "note.txt")));

const list = await fetch(`${BASE_URL}/api/files/list?path=/trash`, { headers: { Cookie: alice } }).then((x) => x.json());
check("trash view is empty", list.data.length === 0, String(list.data.length));
r = await manage(alice, { file: "/trash", option: "empty", confirm: "true" });
check("emptying an empty trash is fine", r.status === 200 && r.json.removed === 0, `${r.status}`);

await prisma.$disconnect();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
