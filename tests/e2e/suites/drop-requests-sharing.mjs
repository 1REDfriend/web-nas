// End-to-end checks for what people with a drop request link may see and download
// of the files it received: the four share modes, downloads and previews through
// share ids, the sender's browser key, passwords, the daily cap and the admin switches.
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
const API = "/api/v1/drops/requests";
// A 1x1 PNG, enough for the preview route
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
const nextIp = () => {
    ipCounter++;
    return `10.99.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
};

// A browser: keeps the cookies the server sets
function browser() {
    const jar = new Map();
    return {
        jar,
        header: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        take(res) {
            for (const line of res.headers.getSetCookie?.() ?? []) {
                const [pair] = line.split(";");
                const eq = pair.indexOf("=");
                jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
            }
        },
    };
}

async function call(method, url, { cookie, json, headers = {}, who } = {}) {
    const cookieHeader = cookie ?? who?.header();
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": nextIp(),
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    who?.take(res);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json: parsed, text, buf, headers: res.headers };
}

async function send(link, fileName, content, who, sender) {
    const params = new URLSearchParams({ id: link, name: fileName });
    if (sender) params.set("sender", sender);
    const form = new FormData();
    form.append("file", new Blob([content]), fileName);
    const res = await fetch(`${BASE_URL}/api/public/drop-request-upload?${params}`, {
        method: "POST",
        headers: { "x-forwarded-for": nextIp(), ...(who?.header() ? { Cookie: who.header() } : {}) },
        body: form,
    });
    who?.take(res);
    return { status: res.status, setCookie: res.headers.get("set-cookie") ?? "", text: await res.text() };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.99.250.1" },
        body: JSON.stringify({ username, password }),
    });
    return res.headers.get("set-cookie")?.split(";")[0];
}

const show = (r) => `${r.status} ${r.text.slice(0, 300)}`;
const info = (link, who) => call("GET", `/api/public/drop-requests/${link}`, { who });
const file = (link, id, who, headers) => call("GET", `/api/public/drop-requests/${link}/files/${id}`, { who, headers });
const raw = (link, id, who) => call("GET", `/api/public/drop-requests/${link}/files/${id}/raw`, { who });
const dropsOf = (requestId) => prisma.drop.findMany({ where: { requestId, completedAt: { not: null } }, orderBy: { createdAt: "asc" } });

try {
    const alice = await login("e2e_alice");
    const admin = await login("e2e_admin");
    const make = async (body) => {
        const r = await call("POST", API, { cookie: alice, json: { title: "Shared", ...body } });
        if (r.status !== 201) throw new Error("could not create the drop request: " + show(r));
        return r.json.data;
    };
    const setMode = (id, body) => call("PATCH", `${API}?id=${id}`, { cookie: alice, json: body });
    const adminPut = (requests) => call("PUT", "/api/admin/drops", { cookie: admin, json: { requests } });

    // --- defaults ---
    let r = await call("GET", "/api/admin/drops", { cookie: admin });
    const settings = r.json?.requests?.settings;
    check("admin defaults allow both download modes and 2000 downloads a day",
        settings?.allowAll === true && settings?.allowOwn === true && settings?.dailyDownloads === 2000, show(r));
    r = await call("GET", API, { cookie: alice });
    check("owner list says new links start with every file downloadable", r.json?.data?.defaults?.shareMode === "all" && r.json?.data?.allowAll === true, show(r));
    r = await call("POST", API, { cookie: alice, json: { title: "x", shareMode: "public" } });
    check("unknown share mode -> 400", r.status === 400, show(r));

    // --- "all": everyone sees and downloads everything ---
    const all = await make({ showSenders: true });
    check("a new link is \"all\"", all.shareMode === "all", all.shareMode);
    const ann = browser();
    const ben = browser();
    r = await send(all.id, "photo.png", PNG, ann, "Ann");
    check("upload sets the sender's browser key cookie", r.status === 201 && new RegExp(`wn_req_me_${all.id}=[A-Za-z0-9_-]{43}`).test(r.setCookie) && /HttpOnly/i.test(r.setCookie), r.setCookie);
    await send(all.id, "notes.txt", "hello world", ben, "Ben");
    const stranger = browser();
    r = await info(all.id, stranger);
    const list = r.json?.request?.received ?? [];
    const png = list.find((f) => f.name === "photo.png");
    const txt = list.find((f) => f.name === "notes.txt");
    check("anyone sees every file with a download id", list.length === 2 && png?.id && txt?.id && r.json?.request?.canDownload === true, show(r));
    check("previews are offered for media only", png?.preview === "image" && txt?.preview === null, JSON.stringify(list));
    check("sender names show when the owner allows", png?.sender === "Ann" && txt?.sender === "Ben", JSON.stringify(list));
    const dropIds = (await dropsOf(all.id)).map((d) => d.id);
    check("drop ids are never shown", dropIds.every((id) => !r.text.includes(id)) && png?.id !== dropIds[0], "");

    r = await file(all.id, txt.id, stranger);
    check("download -> the file, as an attachment", r.status === 200 && r.text === "hello world" && /attachment/i.test(r.headers.get("content-disposition") ?? ""), show(r));
    const txtDrop = await prisma.drop.findUnique({ where: { shareId: txt.id } });
    check("the download is counted on the drop", txtDrop?.downloads === 1, String(txtDrop?.downloads));
    r = await file(all.id, txt.id, stranger, { Range: "bytes=6-" });
    check("a resumed part -> 206 and not counted", r.status === 206 && r.text === "world" && (await prisma.drop.findUnique({ where: { shareId: txt.id } }))?.downloads === 1, show(r));
    r = await raw(all.id, png.id, stranger);
    check("preview -> the image inline", r.status === 200 && r.buf.equals(PNG) && /image\/png/.test(r.headers.get("content-type") ?? ""), show(r));
    r = await raw(all.id, txt.id, stranger);
    check("preview of a non-media file -> 415", r.status === 415, show(r));
    r = await file(all.id, dropIds[0], stranger);
    check("a drop id does not work as a download id -> 404", r.status === 404, show(r));
    r = await file(all.id, "A".repeat(24), stranger);
    check("an unknown download id -> 404", r.status === 404, show(r));

    const other = await make({});
    r = await file(other.id, txt.id, stranger);
    check("another link cannot serve this link's file -> 404", r.status === 404, show(r));

    // --- turning sharing off ends access at once ---
    r = await setMode(all.id, { shareMode: "none" });
    check("owner switches to send only", r.status === 200 && r.json?.data?.shareMode === "none", show(r));
    r = await file(all.id, txt.id, stranger);
    check("a known download id stops working at once -> 404", r.status === 404, show(r));
    r = await info(all.id, stranger);
    check("send only shows nothing", r.json?.request?.received === null && r.json?.request?.canDownload === false, show(r));

    r = await setMode(all.id, { shareMode: "names" });
    r = await info(all.id, stranger);
    check("names mode lists names without download ids",
        r.json?.request?.received?.length === 2 && r.json.request.received.every((f) => !("id" in f) && !("sender" in f)), show(r));
    r = await file(all.id, txt.id, stranger);
    check("names mode refuses downloads -> 404", r.status === 404, show(r));
    await setMode(all.id, { shareMode: "all" });

    // --- "own": each browser sees what it sent ---
    const own = await make({ shareMode: "own" });
    await send(own.id, "ann.txt", "from ann", ann, "Ann");
    await send(own.id, "ben.txt", "from ben", ben, "Ben");
    // A big file sent in pieces is remembered the same way
    r = await call("POST", "/api/uploads?action=start&kind=request", { who: ann, json: { link: own.id, name: "ann-big.bin", size: 6 } });
    const sessionId = r.json?.data?.id;
    await fetch(`${BASE_URL}/api/uploads?kind=request&id=${sessionId}&offset=0`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "x-forwarded-for": nextIp() }, body: Buffer.from("pieces") });
    r = await call("POST", `/api/uploads?action=finish&kind=request&id=${sessionId}`, { who: ann });
    check("a chunked upload works on an \"own\" link", r.status === 201, show(r));

    r = await info(own.id, ann);
    const annFiles = r.json?.request?.received ?? [];
    check("Ann sees only her files, with download ids",
        annFiles.length === 2 && annFiles.every((f) => f.name.startsWith("ann") && f.id) && !("sender" in annFiles[0]), show(r));
    r = await info(own.id, ben);
    const benFiles = r.json?.request?.received ?? [];
    check("Ben sees only his", benFiles.length === 1 && benFiles[0].name === "ben.txt", show(r));
    r = await info(own.id, browser());
    check("a new browser sees an empty list", Array.isArray(r.json?.request?.received) && r.json.request.received.length === 0, show(r));
    r = await file(own.id, annFiles[0].id, ann);
    check("Ann downloads her file", r.status === 200 && r.text.startsWith(annFiles[0].name === "ann.txt" ? "from ann" : "pieces"), show(r));
    r = await file(own.id, annFiles[0].id, ben);
    check("Ben cannot download Ann's file -> 404", r.status === 404, show(r));
    r = await file(own.id, benFiles[0].id, browser());
    check("a browser without the key cannot either -> 404", r.status === 404, show(r));
    const forged = browser();
    forged.jar.set(`wn_req_me_${own.id}`, "x".repeat(43));
    r = await file(own.id, benFiles[0].id, forged);
    check("a made-up key opens nothing -> 404", r.status === 404, show(r));

    // --- passwords ---
    const locked = await make({ password: "open-sesame" });
    const carl = browser();
    await prisma.dropRequest.update({ where: { id: locked.id }, data: { passwordHash: null } });
    await send(locked.id, "secret.txt", "s", carl, "Carl");
    await setMode(locked.id, { password: "open-sesame" });
    const secret = (await dropsOf(locked.id))[0];
    r = await info(locked.id, browser());
    check("a locked link shows no files", r.json?.request?.locked === true && r.json?.request?.received === undefined, show(r));
    r = await file(locked.id, secret.shareId, browser());
    check("download from a locked link without unlocking -> 401", r.status === 401, show(r));
    const dan = browser();
    await call("POST", `/api/public/drop-requests/${locked.id}/unlock`, { who: dan, json: { password: "open-sesame" } });
    r = await file(locked.id, secret.shareId, dan);
    check("after unlocking it downloads", r.status === 200 && r.text === "s", show(r));

    // --- removed and expired files leave the list ---
    await call("DELETE", `/api/v1/drops?id=${txtDrop.id}`, { cookie: alice });
    r = await info(all.id, stranger);
    check("a file the owner removed leaves the list", r.json?.request?.received?.every((f) => f.name !== "notes.txt"), show(r));
    r = await file(all.id, txt.id, stranger);
    check("and cannot be downloaded -> 404", r.status === 404, show(r));

    // --- daily cap ---
    r = await adminPut({ dailyDownloads: 2 });
    check("admin sets 2 downloads a day", r.status === 200 && r.json?.requests?.settings?.dailyDownloads === 2, show(r));
    const capped = await make({});
    await send(capped.id, "c.png", PNG, ann);
    const cFile = (await dropsOf(capped.id))[0];
    const first = await file(capped.id, cFile.shareId, stranger);
    const second = await raw(capped.id, cFile.shareId, stranger);
    check("downloads and previews both count", first.status === 200 && second.status === 200, `${first.status} ${second.status}`);
    r = await file(capped.id, cFile.shareId, stranger);
    check("over the cap -> 429", r.status === 429 && /limit for today/.test(r.text), show(r));
    r = await file(capped.id, cFile.shareId, stranger, { Range: "bytes=3-" });
    check("a resumed part still finishes past the cap", r.status === 206 && r.buf.equals(PNG.subarray(3)), show(r));
    const fresh = await make({});
    await send(fresh.id, "f.txt", "fresh", ann);
    r = await file(fresh.id, (await dropsOf(fresh.id))[0].shareId, stranger);
    check("the cap is per link", r.status === 200, show(r));
    r = await send(capped.id, "more.txt", "m", ann);
    check("sending still works past the cap", r.status === 201, r.text);
    r = await adminPut({ dailyDownloads: 0 });
    r = await file(capped.id, cFile.shareId, stranger);
    check("0 = no limit", r.status === 200, show(r));
    for (const [value, label] of [[-1, "negative"], [1.5, "fraction"], ["10", "text"]]) {
        r = await adminPut({ dailyDownloads: value });
        check(`admin: ${label} daily cap -> 400`, r.status === 400, show(r));
    }

    // --- admin switches ---
    r = await adminPut({ allowAll: false });
    check("admin switches off \"anyone downloads\"", r.status === 200 && r.json?.requests?.settings?.allowAll === false, show(r));
    r = await info(all.id, stranger);
    check("those links fall back to names only", r.json?.request?.shareMode === "names" && r.json.request.received.every((f) => !("id" in f)), show(r));
    r = await file(all.id, png.id, stranger);
    check("and their downloads stop -> 404", r.status === 404, show(r));
    r = await call("POST", API, { cookie: alice, json: { title: "x", shareMode: "all" } });
    check("owners cannot pick it -> 403", r.status === 403, show(r));
    r = await call("GET", API, { cookie: alice });
    check("new links then start as \"own\"", r.json?.data?.defaults?.shareMode === "own" && r.json?.data?.allowAll === false, show(r));
    r = await adminPut({ allowOwn: false });
    r = await info(own.id, ann);
    check("with \"own\" off too, those links show nothing", r.json?.request?.received === null, show(r));
    r = await call("GET", API, { cookie: alice });
    check("and new links start as names only", r.json?.data?.defaults?.shareMode === "names", show(r));
    r = await adminPut({ allowOwn: true, allowAll: true });
    r = await file(all.id, png.id, stranger);
    check("switching back restores downloads", r.status === 200, show(r));

    // --- links made before share modes keep what they did ---
    const aliceUser = await prisma.user.findUnique({ where: { username: "e2e_alice" } });
    const legacyNames = await prisma.dropRequest.create({ data: { id: crypto.randomBytes(18).toString("base64url"), title: "old", keepHours: 24, showReceived: true, userId: aliceUser.id } });
    const legacyNone = await prisma.dropRequest.create({ data: { id: crypto.randomBytes(18).toString("base64url"), title: "old", keepHours: 24, userId: aliceUser.id } });
    r = await info(legacyNames.id, stranger);
    check("an old link that showed names still shows names", r.json?.request?.shareMode === "names", show(r));
    r = await info(legacyNone.id, stranger);
    check("an old send-only link stays send-only", r.json?.request?.shareMode === "none" && r.json?.request?.received === null, show(r));
    r = await call("GET", `${API}?id=${legacyNames.id}`, { cookie: alice });
    check("the owner sees the old link's mode", r.json?.data?.request?.shareMode === "names", show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
