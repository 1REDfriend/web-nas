// Media preview and thumbnails through public share links.
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
const sharp = createRequire(path.join(PROJECT, "package.json"))("sharp");

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
async function share(cookie, p, extra = {}) {
    const r = await fetch(`${BASE_URL}/api/user/share`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ path: p, ...extra }),
    }).then((x) => x.json());
    return r.url.split("/").pop();
}
// Anonymous: no cookie at all
async function pub(id, kind, sub, headers = {}) {
    const res = await fetch(`${BASE_URL}/api/public/share/${id}/${kind}?${new URLSearchParams({ path: sub })}`, { headers });
    return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
}

const pics = path.join(ROOT, "alice", "pics");
await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2563eb" } }).png().toFile(path.join(pics, "sky.png"));
await sharp({ create: { width: 400, height: 400, channels: 3, background: "#16a34a" } }).png().toFile(path.join(pics, "deep", "leaf.png"));
const video = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
fs.writeFileSync(path.join(pics, "clip.mp4"), video);
fs.writeFileSync(path.join(pics, "page.html"), "<script>alert(1)</script>");

const alice = await login("e2e_alice");
const admin = await login("e2e_admin");

// --- non-recursive folder share, no login ---
const flat = await share(alice, "/alice/pics");
let r = await pub(flat, "raw", "/sky.png");
check("shared image streams without login", r.status === 200 && r.headers.get("content-type") === "image/png", `${r.status}`);
check("sandboxed and not sniffed", /sandbox/.test(r.headers.get("content-security-policy") ?? "") && r.headers.get("x-content-type-options") === "nosniff");
r = await pub(flat, "thumb", "/sky.png");
const meta = r.status === 200 ? await sharp(r.buf).metadata() : {};
check("shared thumbnail", r.status === 200 && r.headers.get("content-type") === "image/webp" && meta.width <= 256, `${r.status} ${meta.width}x${meta.height}`);
r = await pub(flat, "raw", "/clip.mp4", { Range: "bytes=100-199" });
check("video seeking works through a share", r.status === 206 && r.buf.equals(video.subarray(100, 200)), `${r.status}`);
r = await pub(flat, "raw", "/page.html");
check("HTML is never served inline", r.status === 415 && !r.buf.includes(Buffer.from("alert")), `${r.status}`);
r = await pub(flat, "raw", "/deep/leaf.png");
check("non-recursive share hides subfolder media", r.status === 404, `${r.status}`);
r = await pub(flat, "thumb", "/deep/leaf.png");
check("... and subfolder thumbnails", r.status === 404, `${r.status}`);
for (const evil of ["/../doc.txt", "/../../bob/secret.txt", "/../pics/sky.png/../../keep.txt"]) {
    r = await pub(flat, "raw", evil);
    check(`no escape via ${evil}`, r.status >= 400 && !r.buf.includes(Buffer.from("alice doc")) && !r.buf.includes(Buffer.from("bob secret")), `${r.status}`);
}

// --- recursive and single-file shares ---
const deep = await share(alice, "/alice/pics", { recursive: true });
r = await pub(deep, "raw", "/deep/leaf.png");
check("recursive share serves subfolder media", r.status === 200, `${r.status}`);
const single = await share(alice, "/alice/pics/sky.png");
r = await pub(single, "raw", "/");
check("single-file share serves the image", r.status === 200 && r.headers.get("content-type") === "image/png", `${r.status}`);
r = await pub(single, "thumb", "/");
check("single-file share thumbnail", r.status === 200, `${r.status}`);
r = await pub(single, "raw", "/../doc.txt");
check("single-file share exposes nothing else", r.status === 404, `${r.status}`);

// --- link must still be valid ---
const shortLived = await share(alice, "/alice/pics", { expireAt: new Date(Date.now() + 1500).toISOString() });
await new Promise((res) => setTimeout(res, 2000));
r = await pub(shortLived, "raw", "/sky.png");
check("expired link -> 410", r.status === 410, `${r.status}`);
const rule = await fetch(`${BASE_URL}/api/admin/path-rules`, {
    method: "POST",
    headers: { Cookie: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/alice/pics", role: "USER", actions: ["SHARE"], recursive: true }),
}).then((x) => x.json());
r = await pub(flat, "thumb", "/sky.png");
check("owner no longer allowed to share -> blocked", r.status === 403, `${r.status}`);
await fetch(`${BASE_URL}/api/admin/path-rules?id=${rule.rule.id}`, { method: "DELETE", headers: { Cookie: admin } });

// --- media has its own rate limit bucket ---
const ip = { "x-forwarded-for": "10.5.5.5" };
for (let i = 0; i < 61; i++) {
    const res = await fetch(`${BASE_URL}/api/public/share/${flat}/download?path=/sky.png`, { headers: ip });
    await res.arrayBuffer();
}
r = await pub(flat, "download", "/sky.png", ip);
check("downloads from this IP are throttled", r.status === 429, `${r.status}`);
r = await pub(flat, "thumb", "/sky.png", ip);
check("thumbnails still load for the same IP", r.status === 200, `${r.status}`);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
