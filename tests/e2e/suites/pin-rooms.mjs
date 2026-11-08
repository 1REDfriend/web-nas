// End-to-end checks for PIN rooms (/p): off by default and admin-only settings,
// making and joining rooms, the member cookie, notes and files (in pieces), who may
// fetch and delete what, limits, locking, wrong-PIN rate limits, longer PINs when
// many rooms are open, and rooms deleted with their files when they end.
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
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const MB = 1024 * 1024;

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
const freshIp = () => {
    ipCounter++;
    return `10.77.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
};

// A browser with its own cookies and (by default) its own IP
function browser(ip = freshIp()) {
    const jar = new Map();
    return {
        ip,
        jar,
        header: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        take(res) {
            for (const line of res.headers.getSetCookie?.() ?? []) {
                const [pair] = line.split(";");
                const eq = pair.indexOf("=");
                const value = pair.slice(eq + 1).trim();
                if (value) jar.set(pair.slice(0, eq).trim(), value);
                else jar.delete(pair.slice(0, eq).trim());
            }
        },
    };
}

async function call(method, url, { who, cookie, json, body, headers = {} } = {}) {
    const cookieHeader = cookie ?? who?.header();
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": who?.ip ?? freshIp(),
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : body,
    });
    who?.take(res);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json: parsed, text, buf, headers: res.headers, setCookie: res.headers.getSetCookie?.() ?? [] };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.77.250.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

// The browser's own path: start, one or more pieces, finish
async function upload(who, name, content, pieceBytes = 32 * MB) {
    let r = await call("POST", "/api/uploads?kind=pin&action=start", { who, json: { size: content.length, name } });
    if (r.status !== 201) return r;
    const id = r.json.data.id;
    for (let offset = 0; offset < content.length; offset += pieceBytes) {
        r = await call("PUT", `/api/uploads?kind=pin&id=${id}&offset=${offset}`, {
            who,
            body: content.subarray(offset, offset + pieceBytes),
            headers: { "Content-Type": "application/octet-stream" },
        });
        if (r.status !== 200) return r;
    }
    return call("POST", `/api/uploads?kind=pin&action=finish&id=${id}`, { who });
}

const show = (r) => `${r.status} ${r.text.slice(0, 300)}`;
const room = (who, v) => call("GET", `/api/public/pin/room${v === undefined ? "" : `?v=${v}`}`, { who });
const create = (who) => call("POST", "/api/public/pin/rooms", { who, json: {} });
const join = (who, pin) => call("POST", "/api/public/pin/join", { who, json: { pin } });
const note = (who, text) => call("POST", "/api/public/pin/room/notes", { who, json: { text } });
const item = (who, id, raw = false) => call("GET", `/api/public/pin/room/items/${id}${raw ? "/raw" : ""}`, { who });
const removeItem = (who, id) => call("DELETE", `/api/public/pin/room/items/${id}`, { who });
const roomRow = (pin) => prisma.pinRoom.findUnique({ where: { pin } });
const roomDir = (row) => path.join(row.baseDir, ".webnas-pin", row.id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(test, ms = 6000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        if (await test()) return true;
        await wait(250);
    }
    return false;
}

try {
    const admin = await login("e2e_admin");
    const alice = await login("e2e_alice");
    const adminPut = (json) => call("PUT", "/api/admin/pin", { cookie: admin, json });

    // ===== off by default, admin-only settings =====
    let r = await call("GET", "/api/public/pin");
    check("off by default: the status says 404", r.status === 404, show(r));
    r = await create(browser());
    check("off: making a room -> 404", r.status === 404, show(r));
    r = await call("GET", "/api/admin/pin");
    check("admin settings need a login -> 401", r.status === 401, show(r));
    r = await call("PUT", "/api/admin/pin", { cookie: alice, json: { enabled: true } });
    check("a USER cannot change them -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/admin/pin", { cookie: admin });
    check("defaults: off, 1 GB rooms, 60 minutes, 3 rooms per IP",
        r.status === 200 && r.json.settings.enabled === false && r.json.settings.roomMB === 1024 && r.json.settings.roomMinutes === 60 && r.json.settings.roomsPerIp === 3, show(r));
    for (const [body, label] of [[{ roomMB: 0 }, "0 MB rooms"], [{ maxItems: 1.5 }, "a fraction"], [{ roomMinutes: "60" }, "text"], [{ enabled: "yes" }, "a non-boolean switch"], [{ roomMB: 10, fileMB: 20 }, "a file cap over the room cap"]]) {
        r = await adminPut(body);
        check(`admin: ${label} -> 400`, r.status === 400, show(r));
    }
    r = await adminPut({ enabled: true, roomMB: 2, fileMB: 1, maxItems: 6, roomMinutes: 60, roomsPerIp: 2, totalMB: 0 });
    check("admin turns PIN rooms on with small limits", r.status === 200 && r.json.settings.enabled === true && r.json.settings.fileMB === 1, show(r));
    r = await call("GET", "/api/public/pin");
    check("the status now shows the limits", r.status === 200 && r.json.limits.fileBytes === String(MB) && r.json.limits.maxItems === 6, show(r));

    // ===== making and joining =====
    const maker = browser();
    r = await call("POST", "/api/public/pin/rooms", { who: maker, body: "{}", headers: { "Content-Type": "text/plain" } });
    check("making a room needs a JSON request (no cross-site forms) -> 415", r.status === 415, show(r));
    r = await create(maker);
    const pin = r.json?.pin;
    const cookieLine = r.setCookie.find((c) => c.startsWith("wn_pin=")) ?? "";
    check("a new room gets a 4-digit PIN and its maker is marked", r.status === 201 && /^\d{4}$/.test(pin) && r.json.isCreator === true, show(r));
    check("the member cookie is HttpOnly, SameSite=Lax and ends with the room", /HttpOnly/i.test(cookieLine) && /SameSite=Lax/i.test(cookieLine) && /Max-Age=(3[5-6]\d\d)/.test(cookieLine), cookieLine);
    const row = await roomRow(pin);
    check("the room's folder exists", row && fs.existsSync(roomDir(row)), row ? roomDir(row) : "no row");

    const friend = browser();
    r = await join(friend, "12");
    check("a too-short PIN -> 404", r.status === 404, show(r));
    r = await join(friend, pin);
    check("the right PIN joins, not as the maker", r.status === 200 && r.json.pin === pin && r.json.isCreator === false, show(r));
    r = await call("POST", "/api/public/pin/join", { who: browser(), body: JSON.stringify({ pin }), headers: { "Content-Type": "text/plain" } });
    check("joining needs a JSON request too -> 415", r.status === 415, show(r));

    const outsider = browser();
    r = await room(outsider);
    check("without the cookie there is no room -> 404", r.status === 404, show(r));
    const [roomId, key] = friend.jar.get("wn_pin").split(".");
    r = await call("GET", "/api/public/pin/room", { cookie: `wn_pin=${roomId}.${key}.${"A".repeat(43)}` });
    check("a forged cookie signature -> 404", r.status === 404, show(r));
    r = await call("GET", "/api/public/pin/room", { cookie: `wn_pin=${roomId}.${crypto.randomBytes(32).toString("base64url")}.${friend.jar.get("wn_pin").split(".")[2]}` });
    check("a signature from another key -> 404", r.status === 404, show(r));

    // ===== notes =====
    r = await note(friend, "see https://example.com/page and bring snacks");
    check("a member adds a note", r.status === 201 && r.json.items?.[0]?.text === "see https://example.com/page and bring snacks", show(r));
    r = await room(maker);
    const friendNote = r.json.items.find((i) => i.kind === "note");
    check("the maker sees it and may delete it", r.status === 200 && friendNote && friendNote.canDelete === true, show(r));
    const version = r.json.version;
    r = await room(maker, version);
    check("polling with the current version says unchanged, without items", r.status === 200 && r.json.unchanged === true && !("items" in r.json), show(r));
    r = await note(friend, "   ");
    check("an empty note -> 400", r.status === 400, show(r));
    r = await note(friend, "x".repeat(20001));
    check("a note over 20,000 characters -> 413", r.status === 413, show(r));
    r = await note(outsider, "hi");
    check("an outsider cannot add a note -> 404", r.status === 404, show(r));

    // ===== files =====
    r = await upload(maker, "dot.png", PNG);
    check("the maker uploads a small file in one piece", r.status === 201 && r.json?.data?.item?.name === "dot.png", show(r));
    const pngId = r.json?.data?.item?.id;
    const big = crypto.randomBytes(900 * 1024);
    r = await upload(friend, "big.bin", big, 300 * 1024);
    check("a member uploads a file in several pieces", r.status === 201 && r.json?.data?.item?.size === big.length, show(r));
    const binId = r.json?.data?.item?.id;
    r = await room(maker, version);
    check("polling now shows the new items", r.status === 200 && !r.json.unchanged && r.json.items.length === 3, show(r));
    const bin = r.json.items.find((i) => i.id === binId);
    check("the maker may delete a member's file; previews only for media",
        bin?.canDelete === true && bin?.preview === null && r.json.items.find((i) => i.id === pngId)?.preview === "image", JSON.stringify(r.json.items));

    r = await item(maker, binId);
    check("another member downloads it byte for byte, as an attachment",
        r.status === 200 && r.buf.equals(big) && /attachment/.test(r.headers.get("content-disposition") ?? ""), show(r));
    r = await item(friend, pngId, true);
    check("an image previews inline", r.status === 200 && r.headers.get("content-type") === "image/png", show(r));
    r = await item(friend, binId, true);
    check("other files do not preview -> 415", r.status === 415, show(r));
    r = await call("GET", `/api/public/pin/room/items/${binId}`, { who: friend, headers: { Range: "bytes=10-19" } });
    check("downloads can resume (Range)", r.status === 206 && r.buf.equals(big.subarray(10, 20)), show(r));
    r = await item(outsider, binId);
    check("an outsider cannot download -> 404", r.status === 404, show(r));
    r = await upload(outsider, "x.txt", Buffer.from("x"));
    check("an outsider cannot upload -> 404", r.status === 404, show(r));

    // ===== limits =====
    r = await upload(friend, "huge.bin", Buffer.alloc(MB + 1));
    check("a file over the per-file cap is refused at the start -> 413", r.status === 413, show(r));
    r = await upload(friend, "fill.bin", Buffer.alloc(MB - 1000));
    check("a file that still fits goes in", r.status === 201, show(r));
    r = await upload(friend, "over.bin", Buffer.alloc(200 * 1024));
    check("more than the room's space -> 413", r.status === 413 && /space/.test(r.text), show(r));
    const onDisk = () => fs.readdirSync(roomDir(row));
    check("refused uploads leave nothing behind", onDisk().every((n) => !n.endsWith(".part")), onDisk().join(","));
    await note(friend, "five");
    r = await note(friend, "six");
    check("the sixth item fits", r.status === 201, show(r));
    r = await note(friend, "seven");
    check("a seventh item is over the item limit -> 413", r.status === 413, show(r));

    // ===== deleting =====
    r = await room(friend);
    const makerPng = r.json.items.find((i) => i.id === pngId);
    check("a member may not delete the maker's file", makerPng?.canDelete === false, JSON.stringify(makerPng));
    r = await removeItem(friend, pngId);
    check("and the server refuses it -> 403", r.status === 403, show(r));
    r = await removeItem(maker, binId);
    check("the maker deletes a member's file", r.status === 200, show(r));
    check("its file is gone from disk", !fs.existsSync(path.join(roomDir(row), binId)), "");
    r = await item(friend, binId);
    check("and it cannot be downloaded any more -> 404", r.status === 404, show(r));
    const after = await roomRow(pin);
    check("its space is given back to the room", Number(after.totalBytes) < MB + 1000 && after.itemCount === 5, `${after.totalBytes} ${after.itemCount}`);

    // ===== locking =====
    r = await call("PATCH", "/api/public/pin/room", { who: friend, json: { locked: true } });
    check("a member cannot lock the room -> 403", r.status === 403, show(r));
    r = await call("PATCH", "/api/public/pin/room", { who: maker, json: { locked: true } });
    check("the maker locks it", r.status === 200 && r.json.locked === true, show(r));
    r = await join(browser(), pin);
    check("a new device cannot join a locked room -> 403", r.status === 403, show(r));
    r = await room(friend);
    check("members already in keep using it", r.status === 200 && r.json.locked === true, show(r));
    await call("PATCH", "/api/public/pin/room", { who: maker, json: { locked: false } });
    r = await join(browser(), pin);
    check("after unlocking, new devices join again", r.status === 200, show(r));

    // ===== leaving =====
    const visitor = browser();
    await join(visitor, pin);
    r = await call("POST", "/api/public/pin/room/leave", { who: visitor, json: {} });
    check("leaving clears the cookie on that browser", r.status === 200 && !visitor.jar.has("wn_pin"), [...visitor.jar.keys()].join(","));
    r = await room(visitor);
    check("and the room is no longer theirs -> 404", r.status === 404, show(r));
    check("the room stays open for the others", (await room(maker)).status === 200, "");

    // ===== wrong PINs are rate limited =====
    const guesser = browser();
    let lastWrong = null;
    for (let i = 0; i < 10; i++) lastWrong = await join(guesser, String(1000 + i).padStart(4, "0") === pin ? "99999999" : String(1000 + i));
    check("ten wrong PINs are answered 404", lastWrong.status === 404, show(lastWrong));
    r = await join(guesser, pin);
    check("then even the right PIN waits -> 429 with Retry-After", r.status === 429 && r.headers.get("retry-after") === "600", show(r));
    r = await join(browser(), pin);
    check("other IPs are not affected", r.status === 200, show(r));

    // ===== rooms per IP =====
    const busy = browser();
    check("an IP may make its first room", (await create(busy)).status === 201, "");
    check("and a second", (await create(browser(busy.ip))).status === 201, "");
    r = await create(browser(busy.ip));
    check("a third open room from that IP -> 429", r.status === 429, show(r));

    // ===== longer PINs when many rooms are open =====
    const base = row.baseDir;
    const fakeIds = [];
    const used = new Set((await prisma.pinRoom.findMany({ select: { pin: true } })).map((p) => p.pin));
    const future = new Date(Date.now() + 60 * 60 * 1000);
    for (let n = 0; fakeIds.length < 100; n++) {
        const fakePin = String(n).padStart(4, "0");
        if (used.has(fakePin)) continue;
        const id = crypto.randomBytes(18).toString("base64url");
        fakeIds.push(id);
        await prisma.pinRoom.create({ data: { id, pin: fakePin, baseDir: base, creatorKeyHash: "x", creatorIp: "10.0.0.1", expiresAt: future } });
    }
    r = await create(browser());
    check("with 1% of 4-digit PINs in use, a new room gets 5 digits", r.status === 201 && /^\d{5}$/.test(r.json.pin), show(r));
    const fivePin = r.json?.pin;
    await prisma.pinRoom.deleteMany({ where: { id: { in: fakeIds } } });
    r = await create(browser());
    check("once they are gone, new rooms get 4 digits again", r.status === 201 && /^\d{4}$/.test(r.json.pin), show(r));
    r = await join(browser(), fivePin.slice(1));
    check("a 5-digit PIN is not reachable with 4 of its digits", r.status === 404 || (r.status === 200 && r.json.pin !== fivePin), show(r));

    // ===== the admin's view =====
    r = await call("GET", "/api/admin/pin", { cookie: admin });
    const listed = r.json?.rooms?.find((x) => x.pin === pin);
    check("the admin sees the open rooms with their use", r.status === 200 && listed && listed.itemCount === 5 && listed.creatorIp === maker.ip, show(r));
    const other = browser();
    r = await create(other);
    const otherRow = await roomRow(r.json.pin);
    r = await call("DELETE", `/api/admin/pin/rooms/${otherRow.id}`, { cookie: alice });
    check("a USER cannot close rooms -> 403", r.status === 403, show(r));
    r = await call("DELETE", `/api/admin/pin/rooms/${otherRow.id}`, { cookie: admin });
    check("the admin closes a room", r.status === 200, show(r));
    check("its members are out at once", (await room(other)).status === 404, "");

    // ===== the maker closes the room =====
    r = await call("DELETE", "/api/public/pin/room", { who: friend });
    check("a member cannot close the room -> 403", r.status === 403, show(r));
    r = await call("DELETE", "/api/public/pin/room", { who: maker });
    check("the maker closes it", r.status === 200, show(r));
    check("its folder and rows are gone", !fs.existsSync(roomDir(row)) && !(await roomRow(pin)) && (await prisma.pinItem.count({ where: { roomId: row.id } })) === 0, "");
    r = await room(friend);
    check("members get 404 after that", r.status === 404, show(r));

    // ===== rooms end on time =====
    const late = browser();
    r = await create(late);
    const lateRow = await roomRow(r.json.pin);
    await upload(late, "a.txt", Buffer.from("bye"));
    await prisma.pinRoom.update({ where: { id: lateRow.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    r = await room(late);
    check("an expired room cannot be used -> 404", r.status === 404, show(r));
    r = await join(browser(), lateRow.pin);
    check("nor joined -> 404", r.status === 404, show(r));
    check("the sweeper deletes it with its files", await waitFor(async () => !fs.existsSync(roomDir(lateRow)) && !(await prisma.pinRoom.findUnique({ where: { id: lateRow.id } }))), "");

    // ===== turning it off =====
    const last = browser();
    r = await create(last);
    const lastRow = await roomRow(r.json.pin);
    r = await adminPut({ enabled: false });
    check("the admin turns PIN rooms off", r.status === 200 && r.json.settings.enabled === false && r.json.rooms.length === 0, show(r));
    check("every room is deleted with its files", !fs.existsSync(roomDir(lastRow)) && (await prisma.pinRoom.count()) === 0, "");
    r = await room(last);
    check("and the public endpoints answer 404", r.status === 404 && (await call("GET", "/api/public/pin")).status === 404, show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
