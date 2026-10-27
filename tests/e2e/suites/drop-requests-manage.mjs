// End-to-end checks for managing drop requests (links that let people send you
// files): the owner's API under /api/v1/drops/requests and the admin side under
// /api/admin/drops.
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

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;
const API = "/api/v1/drops/requests";

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
async function call(method, url, { cookie, key, body } = {}) {
    ipCounter++;
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": `10.90.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
}

async function login(username) {
    const res = await fetch(BASE_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.91.0.1" },
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
const one = (id) => `${API}?${new URLSearchParams({ id })}`;

try {
    const alice = await login("e2e_alice");
    const bob = await login("e2e_bob");
    const guest = await login("e2e_guest");
    const admin = await login("e2e_admin");
    const create = (cookie, body) => call("POST", API, { cookie, body });
    const adminPut = (requests) => call("PUT", "/api/admin/drops", { cookie: admin, body: { requests } });

    // --- who may use it ---
    let r = await call("GET", API);
    check("no session -> 401", r.status === 401, show(r));
    r = await call("GET", API, { cookie: alice });
    check("owner list starts empty, creating allowed", r.status === 200 && r.json?.data?.requests?.length === 0 && r.json?.data?.canCreate === true, show(r));
    check("list reports the defaults",
        r.json?.data?.defaults?.expiresInDays === 7 && r.json?.data?.defaults?.maxFileMB === 100 &&
        r.json?.data?.defaults?.keepHours === 168 && r.json?.data?.maxKeepHours === 168, show(r));
    r = await create(guest, { title: "g" });
    check("GUEST cannot create (no drops for GUEST)", r.status === 403, show(r));

    const noScope = await makeKey("e2e_alice", "read");
    r = await call("GET", API, { key: noScope });
    check("API key without the drop scope -> 403", r.status === 403, show(r));
    const dropKey = await makeKey("e2e_alice", "drop");
    r = await call("GET", API, { key: dropKey });
    check("API key with the drop scope works", r.status === 200 && r.json?.ok === true, show(r));

    // --- input checks ---
    for (const [body, label] of [
        [{}, "missing title"],
        [{ title: "x".repeat(101) }, "title too long"],
        [{ title: "t", expiresInDays: 0 }, "zero days"],
        [{ title: "t", keepHours: 0 }, "keep zero hours"],
        [{ title: "t", keepHours: 169 }, "keep longer than drops may live"],
        [{ title: "t", maxFileMB: -1 }, "negative size"],
        [{ title: "t", password: "abc" }, "short password"],
        [{ title: "t", allowedExt: "pdf, ../x" }, "odd file type"],
        [{ title: "t", requireName: "yes" }, "flag that is not a boolean"],
    ]) {
        r = await create(alice, body);
        check(`${label} -> 400`, r.status === 400 && r.json?.ok === false, show(r));
    }
    check("nothing was created by refused requests", (await prisma.dropRequest.count()) === 0, "");

    // --- create with defaults ---
    r = await create(alice, { title: "Homework", description: "Chapter 3" });
    const basic = r.json?.data;
    check("create -> 201", r.status === 201 && basic?.status === "open", show(r));
    check("link uses the random id", /\/u\/[A-Za-z0-9_-]{24}$/.test(basic?.url ?? ""), basic?.url);
    check("defaults: 7 days, 100 MB per file, 5 GB in all, files kept as long as drops may",
        Math.abs(new Date(basic?.expiresAt).getTime() - (Date.now() + 7 * DAY_MS)) < 60_000 &&
        basic?.maxFileBytes === String(100 * MB) && basic?.maxTotalBytes === String(5 * 1024 * MB) &&
        basic?.maxFiles === null && basic?.keepHours === 168, show(r));
    check("response has no password hash or folder", !/passwordHash|password_hash|targetPath/.test(r.text), r.text);

    r = await create(alice, {
        title: "Full", slug: "alice-hw", expiresInDays: null, keepHours: 24, maxFileMB: null, maxTotalMB: null,
        maxFiles: 10, allowedExt: ".PDF, docx ,pdf", password: "s3cret!", requireName: true, showReceived: true,
    });
    const full = r.json?.data;
    check("create with every option -> 201", r.status === 201, show(r));
    check("custom link name is used", full?.url?.endsWith("/u/alice-hw"), full?.url);
    check("no expiry, no size caps, kept 24 hours", full?.expiresAt === null && full?.maxFileBytes === null && full?.maxTotalBytes === null && full?.keepHours === 24, show(r));
    check("file types are cleaned up", full?.allowedExt === "pdf,docx", full?.allowedExt);
    check("password is stored, not shown", full?.hasPassword === true && !r.text.includes("s3cret"), r.text);
    const stored = await prisma.dropRequest.findUnique({ where: { id: full?.id } });
    check("password is stored as a hash", stored?.passwordHash?.startsWith("$2") && stored.passwordHash !== "s3cret!", "");

    r = await call("POST", API, { key: dropKey, body: { title: "From a script" } });
    check("an API key can create one", r.status === 201, show(r));
    await call("DELETE", one(r.json?.data?.id ?? "x"), { key: dropKey });

    // --- link names ---
    for (const [slug, label] of [["AB", "too short / upper case"], ["-abc", "leading dash"], ["abc-", "trailing dash"], ["a b c", "space"], ["x".repeat(41), "too long"]]) {
        r = await create(alice, { title: "s", slug });
        check(`link name ${label} -> 400`, r.status === 400, show(r));
    }
    r = await create(bob, { title: "s", slug: "alice-hw" });
    check("link name taken by someone else -> 409", r.status === 409, show(r));
    // An id that happens to look like a link name: the name must not shadow it
    const lowerId = "abcdefghijklmnopqrstuvwx";
    await prisma.dropRequest.create({ data: { id: lowerId, title: "plain", keepHours: 24, userId: stored.userId } });
    r = await create(bob, { title: "s", slug: lowerId });
    check("link name equal to an existing id -> 409", r.status === 409, show(r));
    await prisma.dropRequest.delete({ where: { id: lowerId } });

    // --- owners only ---
    r = await call("GET", one(basic.id), { cookie: bob });
    check("another user cannot read it -> 404", r.status === 404, show(r));
    r = await call("PATCH", one(basic.id), { cookie: bob, body: { closed: true } });
    check("another user cannot change it -> 404", r.status === 404, show(r));
    r = await call("DELETE", one(basic.id), { cookie: bob });
    check("another user cannot delete it -> 404", r.status === 404, show(r));
    r = await call("GET", API, { cookie: bob });
    check("another user's list does not show it", r.json?.data?.requests?.every((i) => i.id !== basic.id), show(r));
    r = await call("GET", one(basic.id), { cookie: alice });
    check("owner reads it with its received drops", r.status === 200 && r.json?.data?.request?.id === basic.id && Array.isArray(r.json?.data?.received), show(r));

    // --- changes ---
    r = await call("PATCH", one(basic.id), { cookie: alice, body: { closed: true } });
    check("pause -> closed", r.status === 200 && r.json?.data?.status === "closed" && r.json?.data?.closedAt, show(r));
    r = await call("PATCH", one(basic.id), { cookie: alice, body: { closed: false, title: "Homework 2", keepHours: 48 } });
    check("reopen, rename and keep files for less",
        r.json?.data?.status === "open" && r.json?.data?.title === "Homework 2" && r.json?.data?.keepHours === 48, show(r));
    r = await call("PATCH", one(basic.id), { cookie: alice, body: { description: "" } });
    check("an untouched field keeps its value", r.json?.data?.title === "Homework 2" && r.json?.data?.description === null && r.json?.data?.keepHours === 48, show(r));
    r = await call("PATCH", one(full.id), { cookie: alice, body: { password: null, slug: null } });
    check("password and link name can be removed", r.json?.data?.hasPassword === false && r.json?.data?.slug === null, show(r));
    r = await call("PATCH", one(full.id), { cookie: alice, body: { slug: "alice-hw" } });
    check("own link name can be taken back", r.status === 200 && r.json?.data?.slug === "alice-hw", show(r));

    // --- admin ---
    r = await call("GET", "/api/admin/drops", { cookie: alice });
    check("non-admin cannot read admin settings -> 403", r.status === 403, show(r));
    r = await call("PUT", "/api/admin/drops", { cookie: alice, body: { requests: { enabled: false } } });
    check("non-admin cannot change admin settings -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/admin/drops", { cookie: admin });
    check("admin sees every link with its owner",
        r.status === 200 && r.json?.requests?.list?.length === 2 && r.json.requests.list.every((i) => i.owner === "e2e_alice"), show(r));
    check("admin settings have the defaults",
        r.json?.requests?.settings?.enabled === true && r.json?.requests?.settings?.allowNoExpiry === true &&
        r.json?.requests?.settings?.roles?.join() === "ADMIN,USER", show(r));
    for (const [body, label] of [[{ roles: ["ROOT"] }, "unknown role"], [{ enabled: "no" }, "enabled not a boolean"], [{ allowNoExpiry: 1 }, "allowNoExpiry not a boolean"]]) {
        r = await adminPut(body);
        check(`admin: ${label} -> 400`, r.status === 400, show(r));
    }
    r = await call("PUT", "/api/admin/drops", { cookie: admin, body: { maxHours: 72 } });
    check("drop limits still save without request settings", r.status === 200 && r.json?.limits?.maxHours === 72 && r.json?.requests?.settings?.enabled === true, show(r));
    r = await create(alice, { title: "k", keepHours: 100 });
    check("keepHours follows the drop lifetime limit", r.status === 400, show(r));
    await call("PUT", "/api/admin/drops", { cookie: admin, body: { maxHours: 168 } });

    r = await adminPut({ allowNoExpiry: false });
    check("admin requires an end date", r.status === 200 && r.json?.requests?.settings?.allowNoExpiry === false, show(r));
    r = await create(alice, { title: "n", expiresInDays: null });
    check("a link without an end date is then refused", r.status === 400, show(r));

    r = await adminPut({ roles: ["ADMIN"] });
    check("admin limits request links to ADMIN", r.status === 200, show(r));
    r = await create(alice, { title: "n" });
    check("a USER then cannot create one", r.status === 403, show(r));
    r = await call("GET", `/api/public/drop-requests/${basic.id}`);
    check("a USER's link stops working when USER is taken out of the roles", r.status === 404, show(r));
    r = await call("GET", API, { cookie: alice });
    check("the USER's list says creating is not allowed", r.json?.data?.canCreate === false && r.json?.data?.enabled === true, show(r));

    r = await adminPut({ enabled: false, roles: ["ADMIN", "USER"] });
    check("admin switches the feature off", r.status === 200 && r.json?.requests?.settings?.enabled === false, show(r));
    r = await create(alice, { title: "n" });
    check("nobody can create while it is off", r.status === 403, show(r));
    r = await call("GET", `/api/public/drop-requests/${basic.id}`);
    check("links answer 404 while it is off", r.status === 404, show(r));
    r = await adminPut({ enabled: true, allowNoExpiry: true });
    check("admin switches it back on", r.status === 200, show(r));
    r = await call("GET", `/api/public/drop-requests/${basic.id}`);
    check("links work again", r.status === 200, show(r));

    r = await call("PATCH", `/api/admin/drops/requests?id=${basic.id}`, { cookie: admin, body: { closed: true } });
    check("admin pauses someone's link", r.status === 200 && (await prisma.dropRequest.findUnique({ where: { id: basic.id } }))?.closedAt !== null, show(r));
    r = await call("PATCH", `/api/admin/drops/requests?id=${basic.id}`, { cookie: alice, body: { closed: false } });
    check("non-admin cannot use the admin pause -> 403", r.status === 403, show(r));
    r = await call("PATCH", `/api/admin/drops/requests?id=${"A".repeat(24)}`, { cookie: admin, body: { closed: true } });
    check("admin pause of an unknown link -> 404", r.status === 404, show(r));
    r = await call("PATCH", `/api/admin/drops/requests?id=${basic.id}`, { cookie: admin, body: { closed: "yes" } });
    check("admin pause needs true or false -> 400", r.status === 400, show(r));

    // --- delete ---
    r = await call("DELETE", one(basic.id), { cookie: alice });
    check("owner deletes it", r.status === 200 && (await prisma.dropRequest.findUnique({ where: { id: basic.id } })) === null, show(r));
    r = await call("GET", `/api/public/drop-requests/${basic.id}`);
    check("a deleted link answers 404", r.status === 404, show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
