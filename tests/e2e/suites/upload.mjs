// End-to-end checks for the browser upload route (/api/files/upload).
// Pins its behaviour so the shared upload code can change underneath it safely.
import fs from "fs";
import path from "path";
import crypto from "crypto";

const WORK = process.env.E2E_WORK_DIR;
if (!WORK) throw new Error("Run the suites with: npm run test:e2e");

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:47213";
const { password } = JSON.parse(fs.readFileSync(path.join(WORK, "creds.json"), "utf8"));
const ROOT = path.join(WORK, "storage-root");

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.30.0.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

async function upload(cookie, { currentPath, fileName, content, method = "POST" } = {}) {
    const form = new FormData();
    if (currentPath !== undefined) form.append("currentPath", currentPath);
    if (fileName !== undefined) form.append("file", new Blob([content ?? ""]), fileName);
    const res = await fetch(`${BASE_URL}/api/files/upload`, {
        method,
        headers: cookie ? { Cookie: cookie } : {},
        body: method === "GET" ? undefined : form,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const show = (r) => `${r.status} ${r.text.slice(0, 200)}`;

const alice = await login("e2e_alice");

let r = await upload(alice, { currentPath: "/alice", fileName: "up1.txt", content: "first" });
check("upload succeeds", r.status === 200 && r.json?.message === "File uploaded successfully" && r.json?.filePath === "/alice/up1.txt", show(r));
check("uploaded content is on disk", exists("alice/up1.txt") && read("alice/up1.txt").toString() === "first", "");

r = await upload(alice, { currentPath: "/alice", fileName: "up1.txt", content: "second" });
check("same name -> 409", r.status === 409 && r.json?.error === "A file with that name already exists", show(r));
check("existing file is left alone", read("alice/up1.txt").toString() === "first", "");

const big = crypto.randomBytes(3 * 1024 * 1024 + 17);
r = await upload(alice, { currentPath: "/alice", fileName: "big.bin", content: big });
check("binary upload succeeds", r.status === 200, show(r));
check("binary content is byte-identical", exists("alice/big.bin") && read("alice/big.bin").equals(big), "");

r = await upload(alice, { currentPath: "/alice/new/deeper", fileName: "n.txt", content: "n" });
check("missing target folders are created", r.status === 200 && exists("alice/new/deeper/n.txt"), show(r));

r = await upload(alice, { currentPath: "/alice/", fileName: "trail.txt", content: "t" });
check("trailing slash in path is fine", r.status === 200 && r.json?.filePath === "/alice/trail.txt", show(r));

r = await upload(alice, { currentPath: "/alice", fileName: "dir\\win.txt", content: "w" });
check("backslash folder part is dropped from the name", r.status === 200 && r.json?.filePath === "/alice/win.txt", show(r));

r = await upload(alice, { currentPath: "/alice", fileName: "..", content: "x" });
check("'..' as file name is rejected", r.status === 400 || r.status === 403, show(r));

r = await upload(alice, { currentPath: "/alice" });
check("no file -> 400", r.status === 400 && r.json?.error === "No file uploaded", show(r));

r = await upload(alice, { fileName: "nopath.txt", content: "x" });
check("no path -> 404", r.status === 404 && r.json?.error === "No Path uploaded", show(r));
check("no-path upload leaves nothing behind", !exists("nopath.txt") && !exists("alice/nopath.txt"), "");

r = await upload(alice, { currentPath: "/bob", fileName: "intrude.txt", content: "x" });
check("upload into another user's folder -> 403", r.status === 403 && !exists("bob/intrude.txt"), show(r));

r = await upload(null, { currentPath: "/alice", fileName: "anon.txt", content: "x" });
check("no login -> 401", r.status === 401 && !exists("alice/anon.txt"), show(r));

r = await upload(alice, { method: "GET" });
check("GET -> 405", r.status === 405, show(r));

process.exit(failures ? 1 : 0);
