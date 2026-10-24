// End-to-end checks for the /api/v1 file endpoints: list, stat, download, upload
// (multipart and raw), folders and delete, with scopes and folder-locked keys.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = process.env.E2E_WORK_DIR;
if (!WORK) throw new Error("Run the suites with: npm run test:e2e");
const PROJECT = path.resolve(HERE, "..", "..", "..");
const req = createRequire(path.join(PROJECT, "package.json"));
const { PrismaClient } = req("@prisma/client");

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:47213";
const { password } = JSON.parse(fs.readFileSync(path.join(WORK, "creds.json"), "utf8"));
const envFile = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8"));
const ROOT = path.join(WORK, "storage-root");
const prisma = new PrismaClient({ datasources: { db: { url: envFile.DATABASE_URL } } });

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

const disk = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(disk(rel));
const read = (rel) => fs.readFileSync(disk(rel));

async function makeKey(username, data = {}) {
    const user = await prisma.user.findUnique({ where: { username } });
    const prefix = crypto.randomBytes(4).toString("hex");
    const fullKey = `wnas_${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    await prisma.apiKey.create({
        data: { userId: user.id, name: `test-${prefix}`, prefix, keyHash, scopes: "list,read,upload,delete", ...data },
    });
    return fullKey;
}

let ipCounter = 0;
async function call(method, url, { key, cookie, body, headers = {}, raw = false } = {}) {
    ipCounter++;
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": `10.40.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
        },
        body,
    });
    if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, json, text };
}

const q = (params) => "?" + new URLSearchParams(params).toString();
const show = (r) => `${r.status} ${(r.text ?? "").slice(0, 220)}`;

function form(fields, file) {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    if (file) f.append("file", new Blob([file.content]), file.name);
    return f;
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.41.0.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

try {
    // --- fixtures: a bot folder for alice, with a link that leads elsewhere in her storage ---
    fs.mkdirSync(disk("alice/bot/docs"), { recursive: true });
    fs.writeFileSync(disk("alice/bot/hello.txt"), "hello world");
    fs.writeFileSync(disk("alice/bot/docs/b.txt"), "bbb");
    fs.symlinkSync(disk("alice/sub"), disk("alice/bot/escape"), "junction");

    const locked = await makeKey("e2e_alice", { rootPath: "/alice/bot" });
    const unlocked = await makeKey("e2e_alice");
    const listOnly = await makeKey("e2e_alice", { scopes: "list", rootPath: "/alice/bot" });
    const guestKey = await makeKey("e2e_guest");

    // --- list ---
    let r = await call("GET", "/api/v1/files", { key: locked });
    const names = (r.json?.data?.entries ?? []).map((e) => e.name).sort();
    check("list without path shows the key's folder", r.status === 200 && r.json?.data?.path === "/alice/bot" && names.includes("hello.txt") && names.includes("docs"), show(r));
    const hello = r.json?.data?.entries?.find((e) => e.name === "hello.txt");
    check("list entries carry type, size and mime", hello?.type === "file" && hello?.size === 11 && hello?.mime === "text/plain", JSON.stringify(hello));
    check("folders are typed as folder", r.json?.data?.entries?.find((e) => e.name === "docs")?.type === "folder", "");

    r = await call("GET", "/api/v1/files" + q({ path: "/alice/bot", limit: "1", page: "2", sort: "name" }), { key: locked });
    check("paging works", r.status === 200 && r.json?.data?.entries?.length === 1 && r.json?.data?.total >= 3 && r.json?.data?.page === 2, show(r));
    r = await call("GET", "/api/v1/files" + q({ path: "/alice/bot", sort: "bogus" }), { key: locked });
    check("unknown sort -> 400", r.status === 400 && r.json?.code === "BAD_REQUEST", show(r));

    r = await call("GET", "/api/v1/files", { key: unlocked });
    check("unlocked key without path lists assigned folders", r.status === 200 && r.json?.data?.path === null && r.json?.data?.entries?.some((e) => e.path === "/alice"), show(r));

    r = await call("GET", "/api/v1/files" + q({ path: "/alice" }), { key: locked });
    check("locked key cannot list the parent", r.status === 403 && r.json?.code === "FORBIDDEN", show(r));
    r = await call("GET", "/api/v1/files" + q({ path: "/alice/bot/../sub" }), { key: locked });
    check("../ out of the key folder -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/v1/files" + q({ path: "/alice/bot/escape" }), { key: locked });
    check("symlink out of the key folder -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/v1/files" + q({ path: "/bob" }), { key: unlocked });
    check("another user's folder -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/v1/files" + q({ path: "/trash" }), { key: unlocked });
    check("trash is not exposed -> 400", r.status === 400, show(r));
    r = await call("GET", "/api/v1/files" + q({ path: "/alice/bot/hello.txt" }), { key: locked });
    check("listing a file -> 400", r.status === 400, show(r));
    r = await call("GET", "/api/v1/files" + q({ path: "/alice/bot/missing" }), { key: locked });
    check("listing a missing folder -> 404", r.status === 404 && r.json?.code === "NOT_FOUND", show(r));
    r = await call("GET", "/api/v1/files");
    check("list without auth -> 401", r.status === 401 && r.json?.ok === false, show(r));

    // --- stat ---
    r = await call("GET", "/api/v1/files/stat" + q({ path: "/alice/bot/hello.txt" }), { key: listOnly });
    check("stat a file", r.status === 200 && r.json?.data?.type === "file" && r.json?.data?.size === 11 && r.json?.data?.path === "/alice/bot/hello.txt", show(r));
    r = await call("GET", "/api/v1/files/stat" + q({ path: "/alice/bot" }), { key: listOnly });
    check("stat the key folder", r.status === 200 && r.json?.data?.type === "folder" && r.json?.data?.size === null, show(r));
    r = await call("GET", "/api/v1/files/stat" + q({ path: "/alice/bot/escape/inner/note.txt" }), { key: locked });
    check("stat through the escaping link -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/v1/files/stat" + q({ path: "/alice/bot/nope.txt" }), { key: locked });
    check("stat a missing file -> 404", r.status === 404, show(r));

    // --- download ---
    r = await call("GET", "/api/v1/files/download" + q({ path: "/alice/bot/hello.txt" }), { key: locked, raw: true });
    check("download a file", r.status === 200 && r.buffer.toString() === "hello world" && r.headers.get("accept-ranges") === "bytes", `${r.status}`);
    r = await call("GET", "/api/v1/files/download" + q({ path: "/alice/bot/hello.txt" }), { key: locked, raw: true, headers: { Range: "bytes=6-10" } });
    check("Range request -> 206 with the slice", r.status === 206 && r.buffer.toString() === "world" && r.headers.get("content-range") === "bytes 6-10/11", `${r.status} ${r.buffer}`);
    r = await call("GET", "/api/v1/files/download" + q({ path: "/alice/bot/hello.txt" }), { key: locked, raw: true, headers: { Range: "bytes=500-" } });
    check("unsatisfiable Range -> 416", r.status === 416, `${r.status}`);
    r = await call("GET", "/api/v1/files/download" + q({ path: "/alice/bot/hello.txt" }), { key: listOnly });
    check("download without read scope -> 403", r.status === 403 && /read/.test(r.json?.error ?? ""), show(r));
    r = await call("GET", "/api/v1/files/download" + q({ path: "/alice/bot/escape/inner/note.txt" }), { key: locked });
    check("download through the escaping link -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/v1/files/download" + q({ path: "/alice/bot/docs" }), { key: locked });
    check("folder-locked key cannot zip a folder", r.status === 400, show(r));
    r = await call("GET", "/api/v1/files/download" + q({ path: "/alice/bot/docs" }), { key: unlocked, raw: true });
    check("unlocked key gets a folder as zip", r.status === 200 && r.headers.get("content-type") === "application/zip" && r.buffer.subarray(0, 2).toString() === "PK", `${r.status}`);

    // --- raw upload ---
    const put = (p, body, extra = {}, key = locked) =>
        call("PUT", "/api/v1/files/raw" + q({ path: p, ...extra }), { key, body, headers: { "Content-Type": "application/octet-stream" } });

    r = await put("/alice/bot/up/raw.txt", "raw one");
    check("raw upload creates the file and folders", r.status === 201 && r.json?.data?.path === "/alice/bot/up/raw.txt" && r.json?.data?.size === 7 && r.json?.data?.overwritten === false, show(r));
    check("raw upload content on disk", exists("alice/bot/up/raw.txt") && read("alice/bot/up/raw.txt").toString() === "raw one", "");
    r = await put("/alice/bot/up/raw.txt", "raw two");
    check("raw upload over an existing file -> 409", r.status === 409 && r.json?.code === "CONFLICT", show(r));
    check("existing file kept", read("alice/bot/up/raw.txt").toString() === "raw one", "");
    r = await put("/alice/bot/up/raw.txt", "raw two!", { overwrite: "1" });
    check("overwrite=1 replaces it", r.status === 200 && r.json?.data?.overwritten === true && read("alice/bot/up/raw.txt").toString() === "raw two!", show(r));
    check("no staging files left behind", fs.readdirSync(disk("alice/bot/up")).every((n) => !n.startsWith(".upload-")), fs.readdirSync(disk("alice/bot/up")).join(","));
    r = await put("/alice/bot/docs", "x", { overwrite: "1" });
    check("cannot overwrite a folder with a file", r.status === 409 && fs.statSync(disk("alice/bot/docs")).isDirectory(), show(r));
    r = await put("/alice/bot/none/x.txt", "x", { mkdirs: "0" });
    check("mkdirs=0 with a missing folder -> 404", r.status === 404 && !exists("alice/bot/none"), show(r));

    const big = crypto.randomBytes(5 * 1024 * 1024 + 3);
    r = await put("/alice/bot/big.bin", big);
    check("5 MB raw upload is byte-identical", r.status === 201 && read("alice/bot/big.bin").equals(big), show(r));
    r = await put("/alice/bot/empty.txt", "");
    check("empty raw upload makes an empty file", r.status === 201 && read("alice/bot/empty.txt").length === 0, show(r));

    r = await put("/alice/outside.txt", "x");
    check("raw upload outside the key folder -> 403", r.status === 403 && !exists("alice/outside.txt"), show(r));
    r = await put("/alice/bot/escape/sneak.txt", "x");
    check("raw upload through the escaping link -> 403", r.status === 403 && !exists("alice/sub/sneak.txt"), show(r));
    r = await put("/alice/bot", "x", { overwrite: "1" });
    check("raw upload onto the key folder itself -> refused", (r.status === 403 || r.status === 409) && fs.statSync(disk("alice/bot")).isDirectory(), show(r));
    r = await put("/bob/x.txt", "x", {}, unlocked);
    check("raw upload into another user's folder -> 403", r.status === 403 && !exists("bob/x.txt"), show(r));
    r = await put("/alice/bot/scoped.txt", "x", {}, listOnly);
    check("raw upload without upload scope -> 403", r.status === 403 && !exists("alice/bot/scoped.txt"), show(r));

    // These routes skip proxy.ts, so their own authentication must hold
    r = await call("PUT", "/api/v1/files/raw" + q({ path: "/alice/bot/anon.txt" }), { body: "x" });
    check("raw upload without auth -> 401", r.status === 401 && r.json?.code === "UNAUTHORIZED" && !exists("alice/bot/anon.txt"), show(r));
    r = await call("PUT", "/api/v1/files/raw" + q({ path: "/alice/bot/bad.txt" }), { key: "wnas_bad", body: "x" });
    check("raw upload with a bad key -> 401", r.status === 401 && r.json?.code === "INVALID_API_KEY", show(r));
    const aliceUser = await prisma.user.findUnique({ where: { username: "e2e_alice" } });
    const forged = JSON.stringify({ sub: aliceUser.id, username: "e2e_alice", role: "USER", via: "session" });
    r = await call("PUT", "/api/v1/files/raw" + q({ path: "/alice/forged.txt" }), { body: "x", headers: { "x-user-payload": forged } });
    check("forged header on raw upload -> 401", r.status === 401 && !exists("alice/forged.txt"), show(r));
    r = await call("PUT", "/api/v1/files/raw" + q({ path: "/shared/g.txt" }), { key: guestKey, body: "x" });
    check("GUEST key on raw upload -> 403", r.status === 403 && r.json?.code === "API_KEY_NOT_ALLOWED", show(r));
    const cookie = await login("e2e_alice");
    r = await call("PUT", "/api/v1/files/raw" + q({ path: "/alice/viacookie.txt" }), { cookie, body: "c" });
    check("raw upload with a browser session works", r.status === 201 && read("alice/viacookie.txt").toString() === "c", show(r));

    // --- multipart upload ---
    r = await call("POST", "/api/v1/files/upload", { key: locked, body: form({ path: "/alice/bot/mp" }, { name: "m.txt", content: "multi" }) });
    check("multipart upload", r.status === 201 && r.json?.data?.path === "/alice/bot/mp/m.txt" && read("alice/bot/mp/m.txt").toString() === "multi", show(r));
    r = await call("POST", "/api/v1/files/upload", { key: locked, body: form({ path: "/alice/bot/mp", name: "renamed.txt" }, { name: "m.txt", content: "r" }) });
    check("multipart name field renames", r.status === 201 && exists("alice/bot/mp/renamed.txt"), show(r));
    r = await call("POST", "/api/v1/files/upload", { key: locked, body: form({ path: "/alice/bot/mp" }, { name: "m.txt", content: "again" }) });
    check("multipart name clash -> 409", r.status === 409 && read("alice/bot/mp/m.txt").toString() === "multi", show(r));
    r = await call("POST", "/api/v1/files/upload", { key: locked, body: form({ path: "/alice/bot/mp", overwrite: "true" }, { name: "m.txt", content: "again" }) });
    check("multipart overwrite field", r.status === 200 && read("alice/bot/mp/m.txt").toString() === "again", show(r));
    r = await call("POST", "/api/v1/files/upload", { key: locked, body: form({ path: "/alice/bot/mp" }, { name: "../../../x.txt", content: "t" }) });
    check("multipart file name cannot climb", r.status === 201 && r.json?.data?.path === "/alice/bot/mp/x.txt", show(r));
    r = await call("POST", "/api/v1/files/upload" + q({ path: "/alice", name: "pre.txt" }), { key: locked, body: form({}, { name: "pre.txt", content: "x" }) });
    check("query path outside the key folder -> 403", r.status === 403 && !exists("alice/pre.txt"), show(r));
    r = await call("POST", "/api/v1/files/upload", { key: locked, body: form({ path: "/alice/bot" }) });
    check("multipart without a file -> 400", r.status === 400, show(r));
    r = await call("POST", "/api/v1/files/upload", { key: locked, body: form({}, { name: "nopath.txt", content: "x" }) });
    check("multipart without a path -> 400", r.status === 400, show(r));
    r = await call("POST", "/api/v1/files/upload", { body: form({ path: "/alice" }, { name: "anon.txt", content: "x" }) });
    check("multipart without auth -> 401", r.status === 401 && !exists("alice/anon.txt"), show(r));

    // --- folders ---
    const mkdir = (p, key = locked) => call("POST", "/api/v1/folders", { key, body: JSON.stringify({ path: p }), headers: { "Content-Type": "application/json" } });
    r = await mkdir("/alice/bot/new/deep");
    check("create folder with parents", r.status === 201 && r.json?.data?.created === true && fs.statSync(disk("alice/bot/new/deep")).isDirectory(), show(r));
    r = await mkdir("/alice/bot/new/deep");
    check("existing folder is not an error", r.status === 200 && r.json?.data?.created === false, show(r));
    r = await mkdir("/alice/bot/hello.txt");
    check("folder over a file -> 409", r.status === 409, show(r));
    r = await mkdir("/alice/nobot");
    check("folder outside the key folder -> 403", r.status === 403 && !exists("alice/nobot"), show(r));
    r = await mkdir("/alice/bot/x", listOnly);
    check("folder without upload scope -> 403", r.status === 403, show(r));

    // --- delete ---
    const del = (p, key = locked) => call("DELETE", "/api/v1/files" + q({ path: p }), { key });
    r = await del("/alice/bot/hello.txt");
    check("delete moves the file to the trash", r.status === 200 && r.json?.data?.movedToTrash === true && !exists("alice/bot/hello.txt"), show(r));
    const trashRow = await prisma.trashShedule.findFirst({ where: { userId: aliceUser.id, originalPath: "/alice/bot/hello.txt" } });
    check("trash record is kept for restore", trashRow !== null, "");
    r = await del("/alice/bot/hello.txt");
    check("deleting a missing file -> 404", r.status === 404, show(r));
    r = await del("/alice/bot");
    check("a key cannot delete its own folder", r.status === 403 && exists("alice/bot"), show(r));
    r = await del("/alice/keep.txt");
    check("delete outside the key folder -> 403", r.status === 403 && exists("alice/keep.txt"), show(r));
    r = await del("/alice/bot/docs/b.txt", listOnly);
    check("delete without delete scope -> 403", r.status === 403 && exists("alice/bot/docs/b.txt"), show(r));
    r = await del("/alice/bot/escape/inner/note.txt");
    check("delete through the escaping link -> 403", r.status === 403 && exists("alice/sub/inner/note.txt"), show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
