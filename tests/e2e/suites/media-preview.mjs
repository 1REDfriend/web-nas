// Inline media through /api/files/raw: type allowlist, Range requests, permissions.
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
async function raw(cookie, file, range) {
    const res = await fetch(`${BASE_URL}/api/files/raw?${new URLSearchParams({ file })}`, {
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(range ? { Range: range } : {}) },
    });
    return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
}

// Fixtures: a real 1x1 PNG, a fake 1000-byte video, and script-capable files
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
const video = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
fs.writeFileSync(path.join(ROOT, "alice", "pic.png"), png);
fs.writeFileSync(path.join(ROOT, "alice", "clip.mp4"), video);
fs.writeFileSync(path.join(ROOT, "alice", "evil.html"), "<script>alert(1)</script>");
fs.writeFileSync(path.join(ROOT, "alice", "evil.svg"), "<svg onload=alert(1)></svg>");
fs.writeFileSync(path.join(ROOT, "alice", "big.mp4"), Buffer.alloc(50 * 1024 * 1024, 7));

const alice = await login("e2e_alice");
const bob = await login("e2e_bob");
const admin = await login("e2e_admin");

// --- type allowlist + headers ---
let r = await raw(alice, "/alice/pic.png");
check("image is served", r.status === 200 && r.buf.equals(png), `${r.status}`);
check("correct content type", r.headers.get("content-type") === "image/png", r.headers.get("content-type"));
check("shown inline", r.headers.get("content-disposition") === "inline");
check("sandboxed by CSP", /sandbox/.test(r.headers.get("content-security-policy") ?? ""));
check("no MIME sniffing", r.headers.get("x-content-type-options") === "nosniff");
for (const f of ["/alice/evil.html", "/alice/evil.svg", "/alice/doc.txt"]) {
    r = await raw(alice, f);
    check(`not served inline: ${f}`, r.status === 415 && !r.buf.includes(Buffer.from("alert")), `${r.status}`);
}

// --- Range requests ---
r = await raw(alice, "/alice/clip.mp4");
check("full video with Accept-Ranges", r.status === 200 && r.buf.length === 1000 && r.headers.get("accept-ranges") === "bytes");
r = await raw(alice, "/alice/clip.mp4", "bytes=0-99");
check("range start-end", r.status === 206 && r.buf.equals(video.subarray(0, 100)) && r.headers.get("content-range") === "bytes 0-99/1000", `${r.status} ${r.headers.get("content-range")}`);
r = await raw(alice, "/alice/clip.mp4", "bytes=900-");
check("open-ended range", r.status === 206 && r.buf.equals(video.subarray(900)) && r.headers.get("content-length") === "100", `${r.status}`);
r = await raw(alice, "/alice/clip.mp4", "bytes=-50");
check("suffix range", r.status === 206 && r.buf.equals(video.subarray(950)), `${r.status}`);
r = await raw(alice, "/alice/clip.mp4", "bytes=990-5000");
check("range end clamped to file size", r.status === 206 && r.buf.length === 10 && r.headers.get("content-range") === "bytes 990-999/1000", r.headers.get("content-range"));
r = await raw(alice, "/alice/clip.mp4", "bytes=2000-");
check("range past the end is 416", r.status === 416 && r.headers.get("content-range") === "bytes */1000", `${r.status}`);
let t = Date.now();
r = await raw(alice, "/alice/big.mp4", "bytes=40000000-40000999");
check("seeking into a 50 MB video is fast", r.status === 206 && r.buf.length === 1000 && Date.now() - t < 1500, `${Date.now() - t} ms`);

// --- permissions ---
r = await raw(null, "/alice/pic.png");
check("no login -> 401", r.status === 401, `${r.status}`);
r = await raw(bob, "/alice/pic.png");
check("other user -> 403", r.status === 403, `${r.status}`);
r = await raw(alice, "/alice/../bob/x.png");
check("path traversal blocked", r.status === 403 || r.status === 404, `${r.status}`);
const rule = await fetch(`${BASE_URL}/api/admin/path-rules`, {
    method: "POST",
    headers: { Cookie: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/alice", role: "USER", actions: ["DOWNLOAD"], recursive: true }),
}).then((x) => x.json());
r = await raw(alice, "/alice/pic.png");
check("blocked download also blocks preview", r.status === 403, `${r.status}`);
await fetch(`${BASE_URL}/api/admin/path-rules?id=${rule.rule.id}`, { method: "DELETE", headers: { Cookie: admin } });

// --- text preview skips media ---
const pv = await fetch(`${BASE_URL}/api/files/read?${new URLSearchParams({ file: "/alice/big.mp4", option: "preview" })}`, { headers: { Cookie: alice } }).then((x) => x.json());
check("text preview does not read media files", pv.content === null);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
