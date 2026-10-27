// End-to-end checks for the public side of upload links (inboxes): the info for
// /u/<id>, the password unlock, and uploads by people without an account.
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
const prisma = new PrismaClient({ datasources: { db: { url: envFile.DATABASE_URL } } });
const ROOT = envFile.STORAGE_ROOT;
const GONE = "This upload link has expired or does not exist";
const MB = 1024 * 1024;

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
const nextIp = () => {
    ipCounter++;
    return `10.95.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
};

async function call(method, url, { cookie, body, ip } = {}) {
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": ip ?? nextIp(),
            ...(cookie ? { Cookie: cookie } : {}),
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
}

// Sends one file the way the upload page does
async function send(link, fileName, content, { sender, queryName = fileName, cookie, ip } = {}) {
    const params = new URLSearchParams({ id: link });
    if (queryName !== null) params.set("name", queryName);
    if (sender !== undefined) params.set("sender", sender);
    const form = new FormData();
    form.append("file", new Blob([content]), fileName);
    const res = await fetch(`${BASE_URL}/api/public/inbox-upload?${params}`, {
        method: "POST",
        headers: { "x-forwarded-for": ip ?? nextIp(), ...(cookie ? { Cookie: cookie } : {}) },
        body: form,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.96.0.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

const show = (r) => `${r.status} ${r.text.slice(0, 300)}`;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const listDir = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readdirSync(path.join(ROOT, rel)) : []);
const noParts = (rel) => listDir(rel).every((n) => !n.startsWith(".webnas-part-"));
const usage = async (id) => {
    const row = await prisma.inbox.findUnique({ where: { id } });
    return { bytes: Number(row.usedBytes), files: row.fileCount };
};

try {
    const alice = await login("e2e_alice");
    const bob = await login("e2e_bob");
    const make = async (body, cookie = alice) => {
        const r = await call("POST", "/api/user/inboxes", { cookie, body: { title: "Send me files", ...body } });
        if (r.status !== 201) throw new Error("could not create inbox: " + show(r));
        return r.json.inbox;
    };

    // --- info ---
    const open = await make({ targetPath: "/alice/inbox", description: "Anything goes", slug: "alice-box" });
    let r = await call("GET", `/api/public/inbox/${open.id}`);
    check("info needs no login", r.status === 200 && r.json?.inbox?.title === "Send me files" && r.json?.inbox?.status === "open", show(r));
    check("info is not cached", (r.headers.get("cache-control") ?? "").includes("no-store"), "");
    check("info says nothing about the owner or folder", !/alice\/|targetPath|userId|e2e_alice/.test(r.text), r.text);
    check("info gives the limits", r.json?.inbox?.maxFileBytes === String(100 * MB) && r.json?.inbox?.locked === false, show(r));
    r = await call("GET", "/api/public/inbox/alice-box");
    check("custom link name works", r.status === 200 && r.json?.inbox?.title === "Send me files", show(r));
    for (const [id, label] of [["A".repeat(24), "unknown id"], ["no-such-box", "unknown name"], ["a", "malformed"], ["..%2F..%2Fetc", "path-like"]]) {
        r = await call("GET", `/api/public/inbox/${id}`);
        check(`${label} -> 404`, r.status === 404 && r.json?.error === GONE, show(r));
    }

    // --- uploads ---
    r = await send(open.id, "a.txt", "first");
    check("upload -> 201", r.status === 201 && r.json?.file?.name === "a.txt" && r.json?.file?.size === 5, show(r));
    check("file lands in the owner's folder", exists("alice/inbox/a.txt") && read("alice/inbox/a.txt") === "first", listDir("alice/inbox").join());
    check("used space is the real file size", (await usage(open.id)).bytes === 5 && (await usage(open.id)).files === 1, JSON.stringify(await usage(open.id)));
    r = await send("alice-box", "a.txt", "second");
    check("same name -> numbered, never overwritten", r.status === 201 && r.json?.file?.name === "a (1).txt", show(r));
    check("both files are kept", read("alice/inbox/a.txt") === "first" && read("alice/inbox/a (1).txt") === "second", "");
    r = await send(open.id, "a.txt", "third");
    check("third copy -> a (2).txt", r.json?.file?.name === "a (2).txt", show(r));

    for (const [name, expected, label] of [
        ["../../etc/evil.txt", "evil.txt", "path in the name is dropped"],
        ["..\\..\\win.txt", "win.txt", "backslash path is dropped"],
        ["..", "file", "'..' becomes a plain name"],
        [".hidden", "hidden", "leading dot is removed"],
        ['a<b>:"c"|?*.txt', "a_b___c____.txt", "characters Windows cannot store are replaced"],
        ["รายงาน ปี 2026.pdf", "รายงาน ปี 2026.pdf", "non-ASCII name is kept"],
    ]) {
        r = await send(open.id, name, "x");
        check(`${label}`, r.status === 201 && r.json?.file?.name === expected && exists(`alice/inbox/${expected}`), show(r));
    }
    r = await send(open.id, "x".repeat(300) + ".txt", "long");
    check("very long names are cut, extension kept", r.status === 201 && Array.from(r.json?.file?.name ?? "").length === 200 && r.json.file.name.endsWith(".txt"), show(r));
    check("nothing was written outside the folder", !exists("etc/evil.txt") && !exists("win.txt") && !exists("alice/win.txt"), "");
    check("no temp files left behind", noParts("alice/inbox"), listDir("alice/inbox").join());

    const receipts = await prisma.inboxUpload.findMany({ where: { inboxId: open.id } });
    check("each file gets a receipt with the saved path", receipts.length === 10 && receipts.every((u) => u.path.startsWith("/alice/inbox/")), String(receipts.length));
    r = await call("GET", `/api/user/inboxes/${open.id}`, { cookie: alice });
    check("owner sees what was received", r.json?.uploads?.length === 10 && r.json?.inbox?.fileCount === 10, show(r));
    r = await call("GET", `/api/public/inbox/${open.id}`);
    check("visitors do not see received files unless allowed", r.json?.inbox?.received === null, show(r));

    // --- sender names and folders ---
    const named = await make({ targetPath: "/alice/class", requireName: true, splitBySender: true, showReceived: true });
    r = await send(named.id, "hw.pdf", "pdf");
    check("name required -> 400 without it", r.status === 400, show(r));
    r = await send(named.id, "hw.pdf", "pdf", { sender: "   " });
    check("blank name counts as no name", r.status === 400, show(r));
    r = await send(named.id, "hw.pdf", "pdf", { sender: "Somchai" });
    check("file goes in a folder named after the sender", r.status === 201 && exists("alice/class/Somchai/hw.pdf"), show(r));
    r = await send(named.id, "hw.pdf", "pdf", { sender: "../../bob" });
    check("sender name cannot climb out", r.status === 201 && !exists("bob/hw.pdf") && listDir("alice/class").includes("bob"), listDir("alice/class").join());
    r = await call("GET", `/api/public/inbox/${named.id}`);
    check("visitors see received names when allowed",
        r.json?.inbox?.received?.length === 2 && r.json.inbox.received.every((f) => f.name === "hw.pdf" && !("senderName" in f)), show(r));
    const sent = await prisma.inboxUpload.findFirst({ where: { inboxId: named.id, senderName: "Somchai" } });
    check("receipt keeps the sender's name and IP", sent?.senderIp?.startsWith("10.95."), String(sent?.senderIp));

    // --- file types ---
    const pdfOnly = await make({ targetPath: "/alice/pdf", allowedExt: "pdf" });
    r = await send(pdfOnly.id, "notes.txt", "t");
    check("type not accepted -> 415 before the body is read", r.status === 415, show(r));
    r = await send(pdfOnly.id, "notes.txt", "t", { queryName: "fake.pdf" });
    check("the real file name is checked too", r.status === 415 && listDir("alice/pdf").length === 0, show(r) + " " + listDir("alice/pdf").join());
    r = await send(pdfOnly.id, "report.PDF", "p");
    check("accepted type, any case -> 201", r.status === 201, show(r));
    check("refused uploads free their reservation", (await usage(pdfOnly.id)).files === 1 && (await usage(pdfOnly.id)).bytes === 1, JSON.stringify(await usage(pdfOnly.id)));

    // --- size and count limits ---
    const small = await make({ targetPath: "/alice/small", maxFileMB: 1, maxFiles: 2 });
    r = await send(small.id, "big.bin", crypto.randomBytes(2 * MB));
    check("file over the per-file cap -> 413", r.status === 413, show(r));
    check("nothing kept from the refused file", listDir("alice/small").length === 0 && (await usage(small.id)).bytes === 0, listDir("alice/small").join());
    r = await send(small.id, "one.txt", "1");
    const r2 = await send(small.id, "two.txt", "2");
    check("files up to the count limit -> 201", r.status === 201 && r2.status === 201, show(r) + show(r2));
    r = await send(small.id, "three.txt", "3");
    check("one more than the count limit -> refused", r.status === 403 || r.status === 413, show(r));
    r = await call("GET", `/api/public/inbox/${small.id}`);
    check("a full link says so", r.json?.inbox?.status === "full" && r.json?.inbox?.filesLeft === 0, show(r));

    // Parallel uploads into a link with room for about three of them
    const tight = await make({ targetPath: "/alice/tight", maxTotalMB: 1 });
    const chunk = crypto.randomBytes(300 * 1024);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => send(tight.id, `p${i}.bin`, chunk)));
    const okCount = results.filter((x) => x.status === 201).length;
    const after = await usage(tight.id);
    check("parallel uploads never go over the total", after.bytes <= MB && okCount >= 1 && okCount <= 3, `${okCount} ok, ${after.bytes} bytes`);
    check("count and files on disk agree", after.files === okCount && listDir("alice/tight").length === okCount, `${after.files} / ${listDir("alice/tight").join()}`);

    // --- owner quota ---
    await prisma.appSetting.upsert({ where: { key: "inbox.quotaMB" }, create: { key: "inbox.quotaMB", value: "1" }, update: { value: "1" } });
    const other = await make({ targetPath: "/alice/quota", maxTotalMB: null });
    r = await send(other.id, "q.bin", crypto.randomBytes(512 * 1024));
    check("the owner's quota covers all their links", r.status === 413, show(r));
    r = await call("GET", `/api/public/inbox/${other.id}`);
    check("info shows the room left across all links", Number(r.json?.inbox?.bytesLeft) < 512 * 1024, show(r));
    await prisma.appSetting.update({ where: { key: "inbox.quotaMB" }, data: { value: "20480" } });

    // --- password ---
    const locked = await make({ targetPath: "/alice/locked", password: "open-sesame", allowedExt: "zip" });
    r = await call("GET", `/api/public/inbox/${locked.id}`);
    check("locked link shows only its title", r.json?.inbox?.locked === true && r.json?.inbox?.needsPassword === true && r.json?.inbox?.allowedExt === undefined, show(r));
    r = await send(locked.id, "a.zip", "z");
    check("upload without unlocking -> 401", r.status === 401 && listDir("alice/locked").length === 0, show(r));
    r = await call("POST", `/api/public/inbox/${locked.id}/unlock`, { body: { password: "wrong" } });
    check("wrong password -> 403", r.status === 403, show(r));
    r = await call("POST", `/api/public/inbox/${locked.id}/unlock`, { body: { password: "open-sesame" } });
    const setCookie = r.headers.get("set-cookie") ?? "";
    const unlock = setCookie.split(";")[0];
    check("right password -> cookie for this link", r.status === 200 && unlock.startsWith(`wn_inbox_${locked.id}=`) && /HttpOnly/i.test(setCookie), show(r) + " " + setCookie);
    check("unlocked info shows the limits", r.json?.inbox?.locked === false && r.json?.inbox?.allowedExt?.join() === "zip", show(r));
    r = await send(locked.id, "a.zip", "z", { cookie: unlock });
    check("upload with the cookie -> 201", r.status === 201, show(r));
    r = await send(open.id, "x.txt", "x", { cookie: unlock.replace(locked.id, open.id) });
    check("cookie from one link does not open others (open link still fine)", r.status === 201, show(r));
    const forged = unlock.replace(/=(\d+)\./, (_m, exp) => `=${Number(exp) + 1000}.`);
    r = await send(locked.id, "b.zip", "z", { cookie: forged });
    check("tampered cookie -> 401", r.status === 401, show(r));
    await call("PATCH", `/api/user/inboxes/${locked.id}`, { cookie: alice, body: { password: "new-password" } });
    r = await send(locked.id, "c.zip", "z", { cookie: unlock });
    check("changing the password ends old unlocks", r.status === 401, show(r));

    const guessIp = nextIp();
    let last = null;
    for (let i = 0; i < 11; i++) last = await call("POST", `/api/public/inbox/${locked.id}/unlock`, { body: { password: `guess${i}` }, ip: guessIp });
    check("too many wrong passwords -> 429", last.status === 429, show(last));
    r = await call("POST", `/api/public/inbox/${locked.id}/unlock`, { body: { password: "new-password" }, ip: guessIp });
    check("even the right password waits out the lock", r.status === 429, show(r));

    // --- closed, expired, owner loses access ---
    await call("PATCH", `/api/user/inboxes/${open.id}`, { cookie: alice, body: { closed: true } });
    r = await send(open.id, "late.txt", "late");
    check("paused link refuses files", r.status === 403 && !exists("alice/inbox/late.txt"), show(r));
    r = await call("GET", `/api/public/inbox/${open.id}`);
    check("paused link says it is closed", r.json?.inbox?.status === "closed", show(r));
    await call("PATCH", `/api/user/inboxes/${open.id}`, { cookie: alice, body: { closed: false } });

    await prisma.inbox.update({ where: { id: open.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    r = await call("GET", `/api/public/inbox/${open.id}`);
    check("expired link -> 404", r.status === 404 && r.json?.error === GONE, show(r));
    r = await send(open.id, "late.txt", "late");
    check("expired link refuses files -> 404", r.status === 404, show(r));

    const bobBox = await make({ targetPath: "/bob/drop" }, bob);
    const bobUser = await prisma.user.findUnique({ where: { username: "e2e_bob" } });
    await prisma.pathMap.deleteMany({ where: { userId: bobUser.id } });
    r = await send(bobBox.id, "x.txt", "x");
    check("owner no longer has the folder -> refused", r.status === 403 && !exists("bob/drop/x.txt"), show(r));
    await prisma.pathMap.create({ data: { userId: bobUser.id, rootPath: "bob" } });

    const ruleBox = await make({ targetPath: "/alice/ruled" });
    await prisma.pathRule.create({ data: { path: "/alice/ruled", role: "USER", actions: "UPLOAD", recursive: true } });
    r = await send(ruleBox.id, "x.txt", "x");
    check("a protected-folder rule added later blocks uploads", r.status === 403 && !exists("alice/ruled/x.txt"), show(r));
    await prisma.pathRule.deleteMany({ where: { path: "/alice/ruled" } });

    // --- deleting the link keeps the files ---
    await call("DELETE", `/api/user/inboxes/${named.id}`, { cookie: alice });
    check("files stay after the link is deleted", exists("alice/class/Somchai/hw.pdf"), "");
    r = await send(named.id, "hw.pdf", "pdf", { sender: "Late" });
    check("deleted link -> 404", r.status === 404, show(r));

    // --- method, rate limit ---
    r = await call("GET", `/api/public/inbox-upload?id=${open.id}`);
    check("GET on the upload route -> 405", r.status === 405, show(r));
    const flood = nextIp();
    let flooded = null;
    for (let i = 0; i < 31; i++) flooded = await send("A".repeat(24), "f.txt", "f", { ip: flood });
    check("more than 30 uploads in 10 minutes from one IP -> 429", flooded.status === 429, show(flooded));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
