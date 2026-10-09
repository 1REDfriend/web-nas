// Grid thumbnails: generation, cache, limits, permissions.
import fs from "fs";
import path from "path";
import zlib from "zlib";
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
async function thumb(cookie, file, extra = {}) {
    const res = await fetch(`${BASE_URL}/api/files/thumb?${new URLSearchParams({ file })}`, {
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra },
    });
    return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
}

// PNG with a huge declared size but almost no data: a decompression-bomb shape
function bombPng(width, height) {
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (b) => { let x = 0xffffffff; for (const v of b) x = crcTable[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
    const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.alloc(16))), chunk("IEND", Buffer.alloc(0))]);
}

const dir = path.join(ROOT, "alice", "photos");
fs.mkdirSync(dir, { recursive: true });
await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#3366cc" } }).jpeg().toFile(path.join(dir, "big.jpg"));
for (let i = 0; i < 12; i++) {
    await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: i * 20, g: 80, b: 120 } } }).png().toFile(path.join(dir, `p${i}.png`));
}
fs.writeFileSync(path.join(dir, "broken.jpg"), "not really a jpeg");
fs.writeFileSync(path.join(dir, "logo.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
fs.writeFileSync(path.join(dir, "bomb.png"), bombPng(20000, 20000));
const huge = fs.openSync(path.join(dir, "huge.jpg"), "w"); fs.ftruncateSync(huge, 60 * 1024 * 1024); fs.closeSync(huge);

const alice = await login("e2e_alice");
const bob = await login("e2e_bob");
const admin = await login("e2e_admin");

// --- generation + cache ---
let r = await thumb(alice, "/alice/photos/big.jpg");
const meta = r.status === 200 ? await sharp(r.buf).metadata() : {};
check("thumbnail generated", r.status === 200 && r.headers.get("content-type") === "image/webp", `${r.status}`);
check("at most 256px", meta.width <= 256 && meta.height <= 256, `${meta.width}x${meta.height}`);
check("much smaller than the original", r.buf.length < fs.statSync(path.join(dir, "big.jpg")).size, `${r.buf.length} bytes`);
const etag = r.headers.get("etag");
const cached = fs.readdirSync(path.join(env.STORAGE_INTERNAL, "thumbs"), { recursive: true }).filter((f) => String(f).endsWith(".webp"));
check("stored in the thumbnail cache", cached.length === 1, String(cached.length));
r = await thumb(alice, "/alice/photos/big.jpg", { "If-None-Match": etag });
check("unchanged image -> 304", r.status === 304, `${r.status}`);

await new Promise((res) => setTimeout(res, 50));
await sharp({ create: { width: 800, height: 800, channels: 3, background: "#cc3366" } }).jpeg().toFile(path.join(dir, "big.jpg"));
r = await thumb(alice, "/alice/photos/big.jpg", { "If-None-Match": etag });
check("edited image gets a new thumbnail", r.status === 200 && r.headers.get("etag") !== etag, `${r.status}`);

const many = await Promise.all(Array.from({ length: 12 }, (_, i) => thumb(alice, `/alice/photos/p${i}.png`)));
check("12 thumbnails at once all succeed", many.every((x) => x.status === 200), many.map((x) => x.status).join(","));

// --- refused inputs ---
for (const [file, status] of [["/alice/doc.txt", 415], ["/alice/photos/logo.svg", 415], ["/alice/photos/broken.jpg", 422], ["/alice/photos/bomb.png", 422], ["/alice/photos/huge.jpg", 413]]) {
    r = await thumb(alice, file);
    check(`${path.basename(file)} -> ${status}`, r.status === status, `${r.status}`);
}

// --- permissions ---
r = await thumb(null, "/alice/photos/p0.png");
check("no login -> 401", r.status === 401, `${r.status}`);
r = await thumb(bob, "/alice/photos/p0.png");
check("other user -> 403", r.status === 403, `${r.status}`);
const rule = await fetch(`${BASE_URL}/api/admin/path-rules`, {
    method: "POST",
    headers: { Cookie: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/alice/photos", role: "USER", actions: ["DOWNLOAD"], recursive: true }),
}).then((x) => x.json());
r = await thumb(alice, "/alice/photos/p0.png");
check("blocked download also blocks the (cached) thumbnail", r.status === 403, `${r.status}`);
await fetch(`${BASE_URL}/api/admin/path-rules?id=${rule.rule.id}`, { method: "DELETE", headers: { Cookie: admin } });

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
