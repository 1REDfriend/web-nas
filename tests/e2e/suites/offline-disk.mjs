// Simulates an unplugged disk: the folder assigned to a user disappears, then comes back.
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
const env = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8"));
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
const list = async (cookie, p) => {
    const res = await fetch(`${BASE_URL}/api/files/list${p ? "?" + new URLSearchParams({ path: p }) : ""}`, { headers: { Cookie: cookie } });
    return { status: res.status, json: await res.json().catch(() => null) };
};
const mapCount = () => prisma.pathMap.count({ where: { rootPath: "shared" } });

const guest = await login("e2e_guest");
const admin = await login("e2e_admin");
const before = await mapCount();
check("guest has the 'shared' folder assigned", before === 1, String(before));

// unplug
fs.renameSync(path.join(ROOT, "shared"), path.join(ROOT, "shared-unplugged"));

let r = await list(guest);
const root = r.json?.data?.find((f) => f.path === "/shared");
check("root list marks folder offline", r.status === 200 && root?.available === false, JSON.stringify(root));
r = await list(guest, "/shared");
check("opening the missing folder is 404", r.status === 404, `${r.status} ${r.json?.error}`);
r = await list(admin, "/shared");
check("admin opening it is 404 too", r.status === 404, `${r.status}`);
r = await list(guest, "shared");
check("path without slash also just 404", r.status === 404, `${r.status}`);
check("folder assignment is NOT deleted", (await mapCount()) === before, String(await mapCount()));

// plug back in
fs.renameSync(path.join(ROOT, "shared-unplugged"), path.join(ROOT, "shared"));

r = await list(guest);
check("folder is online again", r.json?.data?.find((f) => f.path === "/shared")?.available === true);
r = await list(guest, "/shared");
check("guest can open it again", r.status === 200 && r.json.data.some((f) => f.name === "readme.txt"), `${r.status}`);

await prisma.$disconnect();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
