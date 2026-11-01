// End-to-end checks for big uploads sent in pieces through /api/uploads: into the
// user's folders (file), as a new drop (drop) and through a drop request link (request).
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
const TEMP = path.join(DROP_BASE, ".webnas-uploads");
const HOUR_MS = 60 * 60 * 1000;

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
async function call(method, url, { cookie, key, json, body } = {}) {
    ipCounter++;
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": `10.97.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(body !== undefined ? { "Content-Type": "application/octet-stream" } : {}),
        },
        body: json !== undefined ? JSON.stringify(json) : body,
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json: parsed, text, headers: res.headers };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.98.0.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

async function makeKey(username, scopes) {
    const user = await prisma.user.findUnique({ where: { username } });
    const prefix = crypto.randomBytes(4).toString("hex");
    const fullKey = `wnas_${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    await prisma.apiKey.create({ data: { userId: user.id, name: `test-${prefix}`, prefix, keyHash, scopes } });
    return fullKey;
}

const show = (r) => `${r.status} ${r.text.slice(0, 300)}`;
const q = (params) => new URLSearchParams(params).toString();
const start = (kind, json, auth = {}) => call("POST", `/api/uploads?${q({ action: "start", kind })}`, { ...auth, json });
const piece = (kind, id, offset, body, auth = {}) => call("PUT", `/api/uploads?${q({ kind, id, offset: String(offset) })}`, { ...auth, body });
const finish = (kind, id, auth = {}) => call("POST", `/api/uploads?${q({ action: "finish", kind, id })}`, auth);
const cancel = (kind, id, auth = {}) => call("DELETE", `/api/uploads?${q({ kind, id })}`, auth);
const tempFiles = () => (fs.existsSync(TEMP) ? fs.readdirSync(TEMP) : []);

// Sends `content` in pieces of `size` bytes and finishes
async function sendAll(kind, id, content, size, auth = {}) {
    for (let offset = 0; offset < content.length; offset += size) {
        const r = await piece(kind, id, offset, content.subarray(offset, offset + size), auth);
        if (r.status !== 200) return r;
    }
    return finish(kind, id, auth);
}

try {
    const alice = await login("e2e_alice");
    const bob = await login("e2e_bob");
    const aliceUser = await prisma.user.findUnique({ where: { username: "e2e_alice" } });

    // ===== file: into the user's own folders =====
    let r = await start("file", { dir: "/alice", name: "x.bin", size: 10 });
    check("file: no login -> 401", r.status === 401, show(r));
    r = await start("file", { dir: "/alice", name: "x.bin", size: 10 }, { key: await makeKey("e2e_alice", "upload") });
    check("file: API keys are not accepted -> 401", r.status === 401, show(r));
    r = await start("other", { size: 10 }, { cookie: alice });
    check("unknown kind -> 400", r.status === 400, show(r));
    r = await start("file", { dir: "/alice", name: "x.bin" }, { cookie: alice });
    check("file: missing size -> 400", r.status === 400, show(r));
    r = await start("file", { dir: "/bob", name: "x.bin", size: 10 }, { cookie: alice });
    check("file: someone else's folder -> 403 before any bytes", r.status === 403, show(r));
    r = await start("file", { dir: "/alice", name: "doc.txt", size: 10 }, { cookie: alice });
    check("file: an existing name -> 409", r.status === 409, show(r));

    const content = crypto.randomBytes(250 * 1024);
    r = await start("file", { dir: "/alice/big", name: "../big.bin", size: content.length }, { cookie: alice });
    const fileId = r.json?.data?.id;
    check("file: start -> 201 with an id", r.status === 201 && /^[A-Za-z0-9_-]{24}$/.test(fileId ?? ""), show(r));
    check("file: the temp file sits outside user storage", tempFiles().includes(`${fileId}.part`), tempFiles().join());

    r = await piece("file", fileId, 0, content.subarray(0, 100 * 1024), { cookie: bob });
    check("file: another user cannot send pieces -> 404", r.status === 404, show(r));
    r = await piece("file", fileId, 0, content.subarray(0, 100 * 1024), { cookie: alice });
    check("file: first piece -> 200", r.status === 200 && r.json?.data?.received === 100 * 1024, show(r));
    r = await piece("file", fileId, 0, content.subarray(0, 100 * 1024), { cookie: alice });
    check("file: resending a piece -> 409 saying where to go on", r.status === 409 && r.json?.received === 100 * 1024, show(r));
    r = await piece("file", fileId, 100 * 1024, crypto.randomBytes(200 * 1024), { cookie: alice });
    check("file: more than the announced size -> 413", r.status === 413, show(r));
    r = await finish("file", fileId, { cookie: alice });
    check("file: finishing early -> 409, upload kept", r.status === 409 && (await prisma.uploadSession.count({ where: { id: fileId } })) === 1, show(r));
    await piece("file", fileId, 100 * 1024, content.subarray(100 * 1024, 200 * 1024), { cookie: alice });
    await piece("file", fileId, 200 * 1024, content.subarray(200 * 1024), { cookie: alice });
    r = await finish("file", fileId, { cookie: alice });
    check("file: finish -> 201 with its path", r.status === 201 && r.json?.data?.filePath === "/alice/big/big.bin", show(r));
    const saved = path.join(ROOT, "alice", "big", "big.bin");
    check("file: the file is whole and in place", fs.existsSync(saved) && fs.readFileSync(saved).equals(content), "");
    check("file: session and temp file are gone", (await prisma.uploadSession.count({ where: { id: fileId } })) === 0 && !tempFiles().includes(`${fileId}.part`), tempFiles().join());
    r = await piece("file", fileId, 0, content.subarray(0, 10), { cookie: alice });
    check("file: a finished upload takes no more pieces -> 404", r.status === 404, show(r));

    r = await start("file", { dir: "/alice/big", name: "big.bin", size: 5 }, { cookie: alice });
    check("file: the same name again -> 409", r.status === 409, show(r));
    r = await start("file", { dir: "/alice/big", name: "race.bin", size: 4 }, { cookie: alice });
    const raceId = r.json?.data?.id;
    fs.writeFileSync(path.join(ROOT, "alice", "big", "race.bin"), "first");
    await piece("file", raceId, 0, Buffer.from("next"), { cookie: alice });
    r = await finish("file", raceId, { cookie: alice });
    check("file: a file that appeared meanwhile is not overwritten -> 409", r.status === 409 && fs.readFileSync(path.join(ROOT, "alice", "big", "race.bin"), "utf8") === "first", show(r));
    check("file: the failed finish cleans up", (await prisma.uploadSession.count({ where: { id: raceId } })) === 0 && !tempFiles().includes(`${raceId}.part`), "");

    r = await start("file", { dir: "/alice", name: "gone.bin", size: 8 }, { cookie: alice });
    const goneId = r.json?.data?.id;
    await piece("file", goneId, 0, Buffer.from("half"), { cookie: alice });
    r = await cancel("file", goneId, { cookie: alice });
    check("file: cancel -> session and temp file gone", r.status === 200 && (await prisma.uploadSession.count({ where: { id: goneId } })) === 0 && !tempFiles().includes(`${goneId}.part`), show(r));

    // ===== drop: a new drop =====
    r = await start("drop", { name: "movie.mkv", size: 300 * 1024, expiresIn: "2h" });
    check("drop: no login -> 401", r.status === 401, show(r));
    r = await start("drop", { name: "movie.mkv", size: 300 * 1024, expiresIn: "99d" }, { cookie: alice });
    check("drop: a lifetime over the limit -> 400", r.status === 400, show(r));
    const dropContent = crypto.randomBytes(300 * 1024);
    r = await start("drop", { name: "movie.mkv", size: dropContent.length, expiresIn: "2h", maxDownloads: "3" }, { cookie: alice });
    const dropId = r.json?.data?.id;
    check("drop: start -> 201", r.status === 201, show(r));
    const placeholder = await prisma.drop.findFirst({ where: { userId: aliceUser.id, completedAt: null }, orderBy: { createdAt: "desc" } });
    check("drop: the announced size is held against the quota", Number(placeholder?.size) === dropContent.length, String(placeholder?.size));
    r = await call("GET", "/api/v1/drops", { cookie: alice });
    check("drop: an unfinished drop is not listed", r.json?.data?.drops?.every((d) => d.id !== placeholder?.id), show(r));
    r = await sendAll("drop", dropId, dropContent, 128 * 1024, { cookie: alice });
    check("drop: finish -> 201 with the drop", r.status === 201 && r.json?.data?.name === "movie.mkv" && r.json?.data?.maxDownloads === 3, show(r));
    const madeDrop = await prisma.drop.findUnique({ where: { id: r.json?.data?.id ?? "" } });
    check("drop: the file is whole in the drop folder",
        madeDrop && fs.readFileSync(path.join(madeDrop.baseDir, madeDrop.id, "file")).equals(dropContent) &&
        fs.readdirSync(path.join(madeDrop.baseDir, madeDrop.id)).join() === "file", "");
    check("drop: its lifetime starts when it finishes",
        madeDrop && Math.abs(madeDrop.expiresAt.getTime() - (madeDrop.completedAt.getTime() + 2 * HOUR_MS)) < 5000, String(madeDrop?.expiresAt));

    const dropKey = await makeKey("e2e_alice", "drop");
    const otherKey = await makeKey("e2e_alice", "drop");
    r = await start("drop", { name: "k.bin", size: 6 }, { key: await makeKey("e2e_alice", "read") });
    check("drop: an API key without the drop scope -> 403", r.status === 403, show(r));
    r = await start("drop", { name: "k.bin", size: 6 }, { key: dropKey });
    const keyId = r.json?.data?.id;
    check("drop: an API key with the drop scope can start", r.status === 201, show(r));
    r = await piece("drop", keyId, 0, Buffer.from("abcdef"), { key: otherKey });
    check("drop: another key of the same user cannot send pieces -> 404", r.status === 404, show(r));
    r = await piece("drop", keyId, 0, Buffer.from("abcdef"), { cookie: alice });
    check("drop: nor can the user's browser session -> 404", r.status === 404, show(r));
    r = await sendAll("drop", keyId, Buffer.from("abcdef"), 6, { key: dropKey });
    check("drop: the key that started it finishes it", r.status === 201, show(r));

    await prisma.appSetting.upsert({ where: { key: "drops.quotaMB" }, create: { key: "drops.quotaMB", value: "1" }, update: { value: "1" } });
    r = await start("drop", { name: "huge.bin", size: 2 * 1024 * 1024 }, { cookie: alice });
    check("drop: bigger than the quota left -> 413 at the start", r.status === 413, show(r));
    await prisma.appSetting.update({ where: { key: "drops.quotaMB" }, data: { value: "10240" } });

    r = await start("drop", { name: "c.bin", size: 10 }, { cookie: alice });
    const cancelDropId = r.json?.data?.id;
    const cancelDrop = await prisma.drop.findFirst({ where: { userId: aliceUser.id, completedAt: null }, orderBy: { createdAt: "desc" } });
    r = await cancel("drop", cancelDropId, { cookie: alice });
    check("drop: cancel removes the placeholder drop and its folder",
        r.status === 200 && (await prisma.drop.count({ where: { id: cancelDrop.id } })) === 0 && !fs.existsSync(path.join(cancelDrop.baseDir, cancelDrop.id)), show(r));

    // ===== request: through a drop request link =====
    const make = async (body) => {
        const x = await call("POST", "/api/v1/drops/requests", { cookie: alice, json: { title: "Big files", ...body } });
        if (x.status !== 201) throw new Error("could not create the drop request: " + show(x));
        return x.json.data;
    };
    const link = await make({ requireName: true, allowedExt: "mkv, zip", maxFileMB: 1, keepHours: 24 });
    r = await start("request", { link: link.id, name: "a.mkv", size: 10 });
    check("request: name required -> 400", r.status === 400, show(r));
    r = await start("request", { link: link.id, name: "a.exe", size: 10, sender: "Ann" });
    check("request: type not accepted -> 415", r.status === 415, show(r));
    r = await start("request", { link: link.id, name: "a.mkv", size: 2 * 1024 * 1024, sender: "Ann" });
    check("request: over the link's file cap -> 413", r.status === 413, show(r));
    r = await start("request", { link: "A".repeat(24), name: "a.mkv", size: 10, sender: "Ann" });
    check("request: unknown link -> 404", r.status === 404, show(r));

    const reqContent = crypto.randomBytes(200 * 1024);
    r = await start("request", { link: link.id, name: "clip.mkv", size: reqContent.length, sender: "Ann" });
    const reqId = r.json?.data?.id;
    check("request: start -> 201 (no login)", r.status === 201, show(r));
    let usage = await prisma.dropRequest.findUnique({ where: { id: link.id } });
    check("request: the link's room is held at the start", Number(usage.usedBytes) === reqContent.length && usage.fileCount === 1, `${usage.usedBytes} / ${usage.fileCount}`);
    r = await piece("file", reqId, 0, reqContent.subarray(0, 10), { cookie: alice });
    check("request: the id does not work as another kind -> 404", r.status === 404, show(r));
    r = await sendAll("request", reqId, reqContent, 64 * 1024);
    check("request: finish -> 201", r.status === 201 && r.json?.data?.file?.name === "clip.mkv" && r.json?.data?.file?.size === reqContent.length, show(r));
    const got = await prisma.drop.findFirst({ where: { requestId: link.id, completedAt: { not: null } } });
    check("request: it became the owner's drop with the sender",
        got?.userId === aliceUser.id && got?.senderName === "Ann" && fs.readFileSync(path.join(got.baseDir, got.id, "file")).equals(reqContent), "");
    check("request: kept for the link's keep time", got && Math.abs(got.expiresAt.getTime() - (got.completedAt.getTime() + 24 * HOUR_MS)) < 5000, String(got?.expiresAt));

    const locked = await make({ password: "open-sesame" });
    r = await start("request", { link: locked.id, name: "a.bin", size: 10 });
    check("request: a locked link needs its password cookie -> 401", r.status === 401, show(r));
    const unlock = await call("POST", `/api/public/drop-requests/${locked.id}/unlock`, { json: { password: "open-sesame" } });
    r = await start("request", { link: locked.id, name: "a.bin", size: 10 }, { cookie: unlock.headers.get("set-cookie")?.split(";")[0] });
    check("request: with the cookie it starts", r.status === 201, show(r));
    await cancel("request", r.json?.data?.id);

    r = await start("request", { link: link.id, name: "late.mkv", size: 1000, sender: "Ann" });
    const lateId = r.json?.data?.id;
    r = await cancel("request", lateId);
    usage = await prisma.dropRequest.findUnique({ where: { id: link.id } });
    check("request: cancel frees the link's room", r.status === 200 && Number(usage.usedBytes) === reqContent.length && usage.fileCount === 1, `${usage.usedBytes} / ${usage.fileCount}`);

    // ===== the sweeper cancels uploads that went quiet =====
    r = await start("request", { link: link.id, name: "idle.mkv", size: 1000, sender: "Ann" });
    const idleId = r.json?.data?.id;
    await piece("request", idleId, 0, Buffer.alloc(100));
    const idleDrop = await prisma.drop.findFirst({ where: { requestId: link.id, completedAt: null } });
    await prisma.uploadSession.update({ where: { id: idleId }, data: { updatedAt: new Date(Date.now() - 2 * HOUR_MS) } });
    let swept = false;
    for (let i = 0; i < 40 && !swept; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        swept = (await prisma.uploadSession.count({ where: { id: idleId } })) === 0;
    }
    usage = await prisma.dropRequest.findUnique({ where: { id: link.id } });
    check("sweeper: an idle upload is cancelled and its room freed",
        swept && (await prisma.drop.count({ where: { id: idleDrop.id } })) === 0 && Number(usage.usedBytes) === reqContent.length && usage.fileCount === 1,
        `${swept} ${usage.usedBytes} / ${usage.fileCount}`);

    r = await call("GET", "/api/uploads?kind=file", { cookie: alice });
    check("GET -> 405", r.status === 405, show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
