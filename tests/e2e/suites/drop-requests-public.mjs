// End-to-end checks for the public side of drop requests: the info for /u/<id>,
// the password unlock, and files sent by people without an account. Every file
// received becomes one of the owner's drops in the drop folder.
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
const DROP_BASE = path.resolve(path.join(envFile.STORAGE_INTERNAL, "drops"));
const GONE = "This link has expired or does not exist";
const MB = 1024 * 1024;
const HOUR_MS = 60 * 60 * 1000;
const API = "/api/v1/drops/requests";

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

// Sends one file the way the request page does
async function send(link, fileName, content, { sender, queryName = fileName, cookie, ip } = {}) {
    const params = new URLSearchParams({ id: link });
    if (queryName !== null) params.set("name", queryName);
    if (sender !== undefined) params.set("sender", sender);
    const form = new FormData();
    form.append("file", new Blob([content]), fileName);
    const res = await fetch(`${BASE_URL}/api/public/drop-request-upload?${params}`, {
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
const usage = async (id) => {
    const row = await prisma.dropRequest.findUnique({ where: { id } });
    return { bytes: Number(row.usedBytes), files: row.fileCount };
};
const dropsOf = (requestId) => prisma.drop.findMany({ where: { requestId, completedAt: { not: null } }, orderBy: { createdAt: "asc" } });
const fileOf = (drop) => path.join(drop.baseDir, drop.id, "file");
const dropFolders = () => (fs.existsSync(DROP_BASE) ? fs.readdirSync(DROP_BASE) : []);
// Everything under the user storage root (not the app's internal store), to prove nothing lands there
const INTERNAL = path.resolve(envFile.STORAGE_INTERNAL);
function storageFiles(dir = ROOT, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (path.resolve(full) === INTERNAL) continue;
        if (entry.isDirectory()) storageFiles(full, out);
        else out.push(path.relative(ROOT, full));
    }
    return out;
}
const setQuotaMB = (value) => prisma.appSetting.upsert({ where: { key: "drops.quotaMB" }, create: { key: "drops.quotaMB", value }, update: { value } });

try {
    const alice = await login("e2e_alice");
    const bob = await login("e2e_bob");
    const make = async (body, cookie = alice) => {
        const r = await call("POST", API, { cookie, body: { title: "Send me files", ...body } });
        if (r.status !== 201) throw new Error("could not create the drop request: " + show(r));
        return r.json.data;
    };
    const storageBefore = storageFiles().sort().join("|");

    // --- info ---
    const open = await make({ description: "Anything goes", slug: "alice-box", keepHours: 48 });
    let r = await call("GET", `/api/public/drop-requests/${open.id}`);
    check("info needs no login", r.status === 200 && r.json?.request?.title === "Send me files" && r.json?.request?.status === "open", show(r));
    check("info is not cached", (r.headers.get("cache-control") ?? "").includes("no-store"), "");
    check("info says nothing about the owner", !/alice\b|userId|e2e_alice|keepHours/.test(r.text.replace("alice-box", "")), r.text);
    check("info gives the limits", r.json?.request?.maxFileBytes === String(100 * MB) && r.json?.request?.locked === false, show(r));
    r = await call("GET", "/api/public/drop-requests/alice-box");
    check("custom link name works", r.status === 200 && r.json?.request?.title === "Send me files", show(r));
    for (const [id, label] of [["A".repeat(24), "unknown id"], ["no-such-box", "unknown name"], ["a", "malformed"], ["..%2F..%2Fetc", "path-like"]]) {
        r = await call("GET", `/api/public/drop-requests/${id}`);
        check(`${label} -> 404`, r.status === 404 && r.json?.error === GONE, show(r));
    }

    // --- uploads become drops ---
    r = await send(open.id, "a.txt", "first");
    check("upload -> 201", r.status === 201 && r.json?.file?.name === "a.txt" && r.json?.file?.size === 5, show(r));
    let drops = await dropsOf(open.id);
    const firstDrop = drops[0];
    check("the file becomes one of the owner's drops", drops.length === 1 && firstDrop.userId === (await prisma.user.findUnique({ where: { username: "e2e_alice" } })).id, String(drops.length));
    check("it is stored in the drop folder", firstDrop && path.resolve(firstDrop.baseDir) === DROP_BASE && fs.readFileSync(fileOf(firstDrop), "utf8") === "first", firstDrop?.baseDir);
    check("it expires after the link's keep time",
        firstDrop && Math.abs(firstDrop.expiresAt.getTime() - (firstDrop.completedAt.getTime() + 48 * HOUR_MS)) < 5000, String(firstDrop?.expiresAt));
    check("it has no download limit and no API key", firstDrop?.maxDownloads === null && firstDrop?.keyId === null, "");
    check("used space is the real file size", (await usage(open.id)).bytes === 5 && (await usage(open.id)).files === 1, JSON.stringify(await usage(open.id)));

    r = await call("GET", "/api/v1/drops", { cookie: alice });
    const listed = r.json?.data?.drops?.find((d) => d.id === firstDrop?.id);
    check("it shows in the owner's drops with where it came from", listed?.requestId === open.id && listed?.name === "a.txt", show(r));
    r = await fetch(`${BASE_URL}/api/public/drops/${firstDrop.id}/download`, { headers: { "x-forwarded-for": nextIp() } });
    check("its drop link downloads the file", r.status === 200 && (await r.text()) === "first", String(r.status));

    r = await send("alice-box", "a.txt", "second");
    check("same name again is fine (each file is its own drop)", r.status === 201 && r.json?.file?.name === "a.txt", show(r));
    drops = await dropsOf(open.id);
    check("both files are kept apart", drops.length === 2 && fs.readFileSync(fileOf(drops[1]), "utf8") === "second", String(drops.length));

    for (const [name, expected, label] of [
        ["../../etc/evil.txt", "evil.txt", "path in the name is dropped"],
        ["..\\..\\win.txt", "win.txt", "backslash path is dropped"],
        ["..", "file", "'..' becomes a plain name"],
        [".hidden", "hidden", "leading dot is removed"],
        ['a<b>:"c"|?*.txt', "a_b___c____.txt", "characters Windows cannot store are replaced"],
        ["รายงาน ปี 2026.pdf", "รายงาน ปี 2026.pdf", "non-ASCII name is kept"],
    ]) {
        r = await send(open.id, name, "x");
        check(`${label}`, r.status === 201 && r.json?.file?.name === expected, show(r));
    }
    r = await send(open.id, "x".repeat(300) + ".txt", "long");
    check("very long names are cut, extension kept", r.status === 201 && Array.from(r.json?.file?.name ?? "").length === 200 && r.json.file.name.endsWith(".txt"), show(r));
    const storageNow = storageFiles().sort().join("|");
    check("nothing was written into user storage", storageNow === storageBefore, storageNow.split("|").filter((f) => !storageBefore.split("|").includes(f)).join(", "));
    drops = await dropsOf(open.id);
    check("every drop folder holds just its file", drops.every((d) => fs.readdirSync(path.join(d.baseDir, d.id)).join() === "file"), "");

    r = await call("GET", `${API}?id=${open.id}`, { cookie: alice });
    check("owner sees what was received", r.json?.data?.received?.length === 9 && r.json?.data?.request?.fileCount === 9, show(r));
    r = await call("GET", `/api/public/drop-requests/${open.id}`);
    check("visitors do not see received files unless allowed", r.json?.request?.received === null, show(r));

    // Removing a received drop takes it out of the owner's list
    r = await call("DELETE", `/api/v1/drops?id=${firstDrop.id}`, { cookie: alice });
    check("owner removes a received drop", r.status === 200, show(r));
    r = await call("GET", `${API}?id=${open.id}`, { cookie: alice });
    check("a removed drop is no longer listed as received", r.json?.data?.received?.every((d) => d.id !== firstDrop.id) && r.json.data.received.length === 8, show(r));

    // --- sender names ---
    const named = await make({ requireName: true, showReceived: true });
    r = await send(named.id, "hw.pdf", "pdf");
    check("name required -> 400 without it", r.status === 400, show(r));
    r = await send(named.id, "hw.pdf", "pdf", { sender: "   " });
    check("blank name counts as no name", r.status === 400, show(r));
    r = await send(named.id, "hw.pdf", "pdf", { sender: "Somchai" });
    check("named sender -> 201", r.status === 201, show(r));
    r = await send(named.id, "hw2.pdf", "pdf", { sender: "../../bob" });
    check("odd sender names are only text", r.status === 201 && !fs.existsSync(path.join(ROOT, "bob", "hw2.pdf")), show(r));
    const sent = (await dropsOf(named.id)).find((d) => d.senderName === "Somchai");
    check("the drop keeps the sender's name and IP", sent?.senderIp?.startsWith("10.95."), String(sent?.senderIp));
    r = await call("GET", `/api/public/drop-requests/${named.id}`);
    check("visitors see received names when allowed",
        r.json?.request?.received?.length === 2 && r.json.request.received.every((f) => f.name.startsWith("hw") && !("senderName" in f) && !("id" in f)), show(r));
    r = await call("GET", "/api/v1/drops", { cookie: alice });
    check("the owner's drops say who sent it", r.json?.data?.drops?.some((d) => d.id === sent?.id && d.senderName === "Somchai"), show(r));

    // --- file types ---
    const pdfOnly = await make({ allowedExt: "pdf" });
    r = await send(pdfOnly.id, "notes.txt", "t");
    check("type not accepted -> 415 before the body is read", r.status === 415, show(r));
    const foldersBefore = dropFolders().length;
    r = await send(pdfOnly.id, "notes.txt", "t", { queryName: "fake.pdf" });
    check("the real file name is checked too", r.status === 415 && (await dropsOf(pdfOnly.id)).length === 0, show(r));
    check("a refused upload leaves no drop row or folder",
        (await prisma.drop.count({ where: { requestId: pdfOnly.id } })) === 0 && dropFolders().length === foldersBefore, String(dropFolders().length));
    r = await send(pdfOnly.id, "report.PDF", "p");
    check("accepted type, any case -> 201", r.status === 201, show(r));
    check("refused uploads free their reservation", (await usage(pdfOnly.id)).files === 1 && (await usage(pdfOnly.id)).bytes === 1, JSON.stringify(await usage(pdfOnly.id)));

    // --- size and count limits ---
    const small = await make({ maxFileMB: 1, maxFiles: 2 });
    r = await send(small.id, "big.bin", crypto.randomBytes(2 * MB));
    check("file over the per-file cap -> 413", r.status === 413, show(r));
    check("nothing kept from the refused file", (await prisma.drop.count({ where: { requestId: small.id } })) === 0 && (await usage(small.id)).bytes === 0, "");
    r = await send(small.id, "one.txt", "1");
    const r2 = await send(small.id, "two.txt", "2");
    check("files up to the count limit -> 201", r.status === 201 && r2.status === 201, show(r) + show(r2));
    r = await send(small.id, "three.txt", "3");
    check("one more than the count limit -> refused", r.status === 403 || r.status === 413, show(r));
    r = await call("GET", `/api/public/drop-requests/${small.id}`);
    check("a full link says so", r.json?.request?.status === "full" && r.json?.request?.filesLeft === 0, show(r));

    // Parallel uploads into a link with room for about three of them
    const tight = await make({ maxTotalMB: 1 });
    const chunk = crypto.randomBytes(300 * 1024);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => send(tight.id, `p${i}.bin`, chunk)));
    const okCount = results.filter((x) => x.status === 201).length;
    const after = await usage(tight.id);
    check("parallel uploads never go over the total", after.bytes <= MB && okCount >= 1 && okCount <= 3, `${okCount} ok, ${after.bytes} bytes`);
    check("count and drops agree", after.files === okCount && (await dropsOf(tight.id)).length === okCount, `${after.files} / ${(await dropsOf(tight.id)).length}`);
    check("no half-made drops are left", (await prisma.drop.count({ where: { requestId: tight.id, completedAt: null } })) === 0, "");

    // --- the owner's drop quota covers received files ---
    const used = Number((await prisma.drop.aggregate({ where: { userId: firstDrop.userId, deletedAt: null }, _sum: { size: true } }))._sum.size ?? 0);
    await setQuotaMB(String(Math.ceil((used + 100 * 1024) / MB)));
    const roomy = await make({ maxTotalMB: null });
    r = await call("GET", `/api/public/drop-requests/${roomy.id}`);
    const left = Number(r.json?.request?.bytesLeft);
    check("info shows the room left in the owner's drop quota", left > 0 && left < MB + 100 * 1024, show(r));
    r = await send(roomy.id, "q.bin", crypto.randomBytes(left + 10 * 1024));
    check("a file over the drop quota -> 413", r.status === 413, show(r));
    r = await send(roomy.id, "q.bin", crypto.randomBytes(Math.floor(left / 2)));
    check("a file that fits -> 201", r.status === 201, show(r));
    r = await call("GET", "/api/v1/drops", { cookie: alice });
    check("received files count in the owner's drop quota", Number(r.json?.data?.quota?.usedBytes) >= used + Math.floor(left / 2), show(r));
    await setQuotaMB("10240");

    // --- password ---
    const locked = await make({ password: "open-sesame", allowedExt: "zip" });
    r = await call("GET", `/api/public/drop-requests/${locked.id}`);
    check("locked link shows only its title", r.json?.request?.locked === true && r.json?.request?.needsPassword === true && r.json?.request?.allowedExt === undefined, show(r));
    r = await send(locked.id, "a.zip", "z");
    check("upload without unlocking -> 401", r.status === 401 && (await dropsOf(locked.id)).length === 0, show(r));
    r = await call("POST", `/api/public/drop-requests/${locked.id}/unlock`, { body: { password: "wrong" } });
    check("wrong password -> 403", r.status === 403, show(r));
    r = await call("POST", `/api/public/drop-requests/${locked.id}/unlock`, { body: { password: "open-sesame" } });
    const setCookie = r.headers.get("set-cookie") ?? "";
    const unlock = setCookie.split(";")[0];
    check("right password -> cookie for this link", r.status === 200 && unlock.startsWith(`wn_req_${locked.id}=`) && /HttpOnly/i.test(setCookie), show(r) + " " + setCookie);
    check("unlocked info shows the limits", r.json?.request?.locked === false && r.json?.request?.allowedExt?.join() === "zip", show(r));
    r = await send(locked.id, "a.zip", "z", { cookie: unlock });
    check("upload with the cookie -> 201", r.status === 201, show(r));
    const forged = unlock.replace(/=(\d+)\./, (_m, exp) => `=${Number(exp) + 1000}.`);
    r = await send(locked.id, "b.zip", "z", { cookie: forged });
    check("tampered cookie -> 401", r.status === 401, show(r));
    await call("PATCH", `${API}?id=${locked.id}`, { cookie: alice, body: { password: "new-password" } });
    r = await send(locked.id, "c.zip", "z", { cookie: unlock });
    check("changing the password ends old unlocks", r.status === 401, show(r));

    const guessIp = nextIp();
    let last = null;
    for (let i = 0; i < 11; i++) last = await call("POST", `/api/public/drop-requests/${locked.id}/unlock`, { body: { password: `guess${i}` }, ip: guessIp });
    check("too many wrong passwords -> 429", last.status === 429, show(last));
    r = await call("POST", `/api/public/drop-requests/${locked.id}/unlock`, { body: { password: "new-password" }, ip: guessIp });
    check("even the right password waits out the lock", r.status === 429, show(r));

    // --- paused, expired, owner loses access ---
    await call("PATCH", `${API}?id=${open.id}`, { cookie: alice, body: { closed: true } });
    r = await send(open.id, "late.txt", "late");
    check("paused link refuses files", r.status === 403, show(r));
    r = await call("GET", `/api/public/drop-requests/${open.id}`);
    check("paused link says it is closed", r.json?.request?.status === "closed", show(r));
    await call("PATCH", `${API}?id=${open.id}`, { cookie: alice, body: { closed: false } });

    await prisma.dropRequest.update({ where: { id: open.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    r = await call("GET", `/api/public/drop-requests/${open.id}`);
    check("expired link -> 404", r.status === 404 && r.json?.error === GONE, show(r));
    r = await send(open.id, "late.txt", "late");
    check("expired link refuses files -> 404", r.status === 404, show(r));
    check("drops it received stay until they expire", (await dropsOf(open.id)).some((d) => d.deletedAt === null && fs.existsSync(fileOf(d))), "");

    const bobBox = await make({}, bob);
    await prisma.user.update({ where: { username: "e2e_bob" }, data: { role: "GUEST" } });
    r = await send(bobBox.id, "x.txt", "x");
    check("owner whose role may no longer make links -> 404", r.status === 404, show(r));
    await prisma.user.update({ where: { username: "e2e_bob" }, data: { role: "USER" } });

    // --- deleting the link keeps the drops it received ---
    const keptIds = (await dropsOf(named.id)).map((d) => d.id);
    r = await call("DELETE", `${API}?id=${named.id}`, { cookie: alice });
    check("owner deletes the link", r.status === 200, show(r));
    const kept = await prisma.drop.findMany({ where: { id: { in: keptIds } } });
    check("its drops stay, no longer tied to it", kept.length === 2 && kept.every((d) => d.requestId === null && d.deletedAt === null && fs.existsSync(fileOf(d))), JSON.stringify(kept.map((d) => d.requestId)));
    r = await send(named.id, "hw.pdf", "pdf", { sender: "Late" });
    check("deleted link -> 404", r.status === 404, show(r));

    // --- the sweeper deletes received drops like any other ---
    const sweepTarget = (await dropsOf(small.id))[0];
    await prisma.drop.update({ where: { id: sweepTarget.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    r = await call("DELETE", `/api/v1/drops?id=${(await dropsOf(small.id))[1].id}`, { cookie: alice });
    let swept = null;
    for (let i = 0; i < 40; i++) {
        swept = await prisma.drop.findUnique({ where: { id: sweepTarget.id } });
        if (swept?.deletedAt && !fs.existsSync(fileOf(sweepTarget))) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    check("an expired received drop is swept: file gone, row marked", swept?.deletedAt !== null && !fs.existsSync(fileOf(sweepTarget)), String(swept?.deletedAt));

    // --- method, rate limit ---
    r = await call("GET", `/api/public/drop-request-upload?id=${open.id}`);
    check("GET on the upload route -> 405", r.status === 405, show(r));
    const flood = nextIp();
    let flooded = null;
    for (let i = 0; i < 31; i++) flooded = await send("A".repeat(24), "f.txt", "f", { ip: flood });
    check("more than 30 uploads in 10 minutes from one IP -> 429", flooded.status === 429, show(flooded));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
