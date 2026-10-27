// End-to-end checks for managing upload links (inboxes): the owner's API under
// /api/user/inboxes and the admin settings under /api/admin/inboxes.
import fs from "fs";
import path from "path";
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

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

let ipCounter = 0;
async function call(method, url, { cookie, body } = {}) {
    ipCounter++;
    const res = await fetch(BASE_URL + url, {
        method,
        headers: {
            "x-forwarded-for": `10.90.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
            ...(cookie ? { Cookie: cookie } : {}),
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

const show = (r) => `${r.status} ${r.text.slice(0, 300)}`;

try {
    const alice = await login("e2e_alice");
    const bob = await login("e2e_bob");
    const guest = await login("e2e_guest");
    const admin = await login("e2e_admin");
    const create = (cookie, body) => call("POST", "/api/user/inboxes", { cookie, body });

    // --- who may use it ---
    let r = await call("GET", "/api/user/inboxes");
    check("no session -> 401", r.status === 401, show(r));
    r = await call("GET", "/api/user/inboxes", { cookie: alice });
    check("owner list starts empty, creating allowed", r.status === 200 && r.json?.inboxes?.length === 0 && r.json?.canCreate === true, show(r));
    check("list reports the defaults and quota",
        r.json?.defaults?.expiresInDays === 7 && r.json?.defaults?.maxFileMB === 100 && r.json?.quota?.limitBytes === 20480 * MB, show(r));
    r = await create(guest, { title: "g", targetPath: "/shared" });
    check("GUEST cannot create by default", r.status === 403, show(r));
    r = await call("GET", "/api/user/inboxes", { cookie: guest });
    check("GUEST list says creating is not allowed", r.status === 200 && r.json?.canCreate === false, show(r));

    // --- input checks ---
    r = await create(alice, { targetPath: "/alice" });
    check("missing title -> 400", r.status === 400, show(r));
    r = await create(alice, { title: "x".repeat(101), targetPath: "/alice" });
    check("title too long -> 400", r.status === 400, show(r));
    r = await create(alice, { title: "t" });
    check("missing folder -> 400", r.status === 400, show(r));
    r = await create(alice, { title: "t", targetPath: "/bob" });
    check("someone else's folder -> 403", r.status === 403, show(r));
    r = await create(alice, { title: "t", targetPath: "/alice/../bob" });
    check("climbing out of the folder -> 403", r.status === 403, show(r));
    r = await create(alice, { title: "t", targetPath: "/alice/doc.txt" });
    check("a file as target -> 400", r.status === 400, show(r));
    r = await create(alice, { title: "t", targetPath: "/alice/link" });
    check("a symlink leading out of storage -> 403", r.status === 403, show(r));
    r = await create(alice, { title: "t", targetPath: "/alice", expiresInDays: 0 });
    check("zero days -> 400", r.status === 400, show(r));
    r = await create(alice, { title: "t", targetPath: "/alice", maxFileMB: -1 });
    check("negative size -> 400", r.status === 400, show(r));
    r = await create(alice, { title: "t", targetPath: "/alice", password: "abc" });
    check("short password -> 400", r.status === 400, show(r));
    r = await create(alice, { title: "t", targetPath: "/alice", allowedExt: "pdf, ../x" });
    check("odd file type -> 400", r.status === 400, show(r));
    r = await create(alice, { title: "t", targetPath: "/alice", requireName: "yes" });
    check("flag that is not a boolean -> 400", r.status === 400, show(r));
    check("nothing was created by refused requests", (await prisma.inbox.count()) === 0, "");

    // --- create with defaults ---
    r = await create(alice, { title: "Homework", description: "Chapter 3", targetPath: "/alice/inbox" });
    const basic = r.json?.inbox;
    check("create -> 201", r.status === 201 && basic?.status === "open", show(r));
    check("a missing target folder is fine (made on first upload)", basic?.targetPath === "/alice/inbox", show(r));
    check("link uses the random id", /\/u\/[A-Za-z0-9_-]{24}$/.test(basic?.url ?? ""), basic?.url);
    check("defaults: 7 days, 100 MB per file, 5 GB in all",
        Math.abs(new Date(basic?.expiresAt).getTime() - (Date.now() + 7 * DAY_MS)) < 60_000 &&
        basic?.maxFileBytes === String(100 * MB) && basic?.maxTotalBytes === String(5 * 1024 * MB) && basic?.maxFiles === null, show(r));
    check("response has no password hash", !/passwordHash|password_hash/.test(r.text), r.text);

    r = await create(alice, {
        title: "Full", targetPath: "/alice", slug: "alice-hw", expiresInDays: null, maxFileMB: null, maxTotalMB: null,
        maxFiles: 10, allowedExt: ".PDF, docx ,pdf", password: "s3cret!", requireName: true, splitBySender: true, showReceived: true,
    });
    const full = r.json?.inbox;
    check("create with every option -> 201", r.status === 201, show(r));
    check("custom link name is used", full?.url?.endsWith("/u/alice-hw"), full?.url);
    check("no expiry, no size caps", full?.expiresAt === null && full?.maxFileBytes === null && full?.maxTotalBytes === null, show(r));
    check("file types are cleaned up", full?.allowedExt === "pdf,docx", full?.allowedExt);
    check("password is stored, not shown", full?.hasPassword === true && !r.text.includes("s3cret"), r.text);
    const stored = await prisma.inbox.findUnique({ where: { id: full?.id } });
    check("password is stored as a hash", stored?.passwordHash?.startsWith("$2") && stored.passwordHash !== "s3cret!", "");

    // --- link names ---
    for (const [slug, label] of [["AB", "too short / upper case"], ["-abc", "leading dash"], ["abc-", "trailing dash"], ["a b c", "space"], ["x".repeat(41), "too long"]]) {
        r = await create(alice, { title: "s", targetPath: "/alice", slug });
        check(`link name ${label} -> 400`, r.status === 400, show(r));
    }
    r = await create(bob, { title: "s", targetPath: "/bob", slug: "alice-hw" });
    check("link name taken by someone else -> 409", r.status === 409, show(r));
    // An id that happens to look like a link name: the name must not shadow it
    const lowerId = "abcdefghijklmnopqrstuvwx";
    await prisma.inbox.create({ data: { id: lowerId, title: "plain", targetPath: "/alice", userId: stored.userId } });
    r = await create(bob, { title: "s", targetPath: "/bob", slug: lowerId });
    check("link name equal to an existing id -> 409", r.status === 409, show(r));
    await prisma.inbox.delete({ where: { id: lowerId } });

    // --- owners only ---
    r = await call("GET", `/api/user/inboxes/${basic.id}`, { cookie: bob });
    check("another user cannot read it -> 404", r.status === 404, show(r));
    r = await call("PATCH", `/api/user/inboxes/${basic.id}`, { cookie: bob, body: { closed: true } });
    check("another user cannot change it -> 404", r.status === 404, show(r));
    r = await call("DELETE", `/api/user/inboxes/${basic.id}`, { cookie: bob });
    check("another user cannot delete it -> 404", r.status === 404, show(r));
    r = await call("GET", "/api/user/inboxes", { cookie: bob });
    check("another user's list does not show it", r.json?.inboxes?.every((i) => i.id !== basic.id), show(r));
    r = await call("GET", `/api/user/inboxes/${basic.id}`, { cookie: alice });
    check("owner reads it with its receipts", r.status === 200 && r.json?.inbox?.id === basic.id && Array.isArray(r.json?.uploads), show(r));

    // --- changes ---
    r = await call("PATCH", `/api/user/inboxes/${basic.id}`, { cookie: alice, body: { closed: true } });
    check("pause -> closed", r.status === 200 && r.json?.inbox?.status === "closed" && r.json?.inbox?.closedAt, show(r));
    r = await call("PATCH", `/api/user/inboxes/${basic.id}`, { cookie: alice, body: { closed: false, title: "Homework 2" } });
    check("reopen and rename", r.json?.inbox?.status === "open" && r.json?.inbox?.title === "Homework 2", show(r));
    r = await call("PATCH", `/api/user/inboxes/${basic.id}`, { cookie: alice, body: { description: "" } });
    check("an untouched field keeps its value", r.json?.inbox?.title === "Homework 2" && r.json?.inbox?.description === null, show(r));
    r = await call("PATCH", `/api/user/inboxes/${basic.id}`, { cookie: alice, body: { targetPath: "/bob" } });
    check("cannot point it at someone else's folder later", r.status === 403, show(r));
    r = await call("PATCH", `/api/user/inboxes/${full.id}`, { cookie: alice, body: { password: null, slug: null } });
    check("password and link name can be removed", r.json?.inbox?.hasPassword === false && r.json?.inbox?.slug === null, show(r));
    r = await call("PATCH", `/api/user/inboxes/${full.id}`, { cookie: alice, body: { slug: "alice-hw" } });
    check("own link name can be taken back", r.status === 200 && r.json?.inbox?.slug === "alice-hw", show(r));

    // --- admin ---
    r = await call("GET", "/api/admin/inboxes", { cookie: alice });
    check("non-admin cannot read admin settings -> 403", r.status === 403, show(r));
    r = await call("PUT", "/api/admin/inboxes", { cookie: alice, body: { enabled: false } });
    check("non-admin cannot change admin settings -> 403", r.status === 403, show(r));
    r = await call("GET", "/api/admin/inboxes", { cookie: admin });
    check("admin sees every link with its owner",
        r.status === 200 && r.json?.inboxes?.length === 2 && r.json.inboxes.every((i) => i.owner === "e2e_alice"), show(r));
    check("admin settings have the defaults",
        r.json?.settings?.enabled === true && r.json?.settings?.quotaMB === 20480 && r.json?.settings?.roles?.join() === "ADMIN,USER", show(r));
    for (const [body, label] of [[{ quotaMB: -1 }, "negative quota"], [{ roles: ["ROOT"] }, "unknown role"], [{ enabled: "no" }, "enabled not a boolean"]]) {
        r = await call("PUT", "/api/admin/inboxes", { cookie: admin, body });
        check(`admin: ${label} -> 400`, r.status === 400, show(r));
    }

    r = await call("PUT", "/api/admin/inboxes", { cookie: admin, body: { roles: ["ADMIN", "USER", "GUEST"] } });
    check("admin lets GUEST create links", r.status === 200 && r.json?.settings?.roles?.includes("GUEST"), show(r));
    r = await create(guest, { title: "g", targetPath: "/shared" });
    // The role is allowed now; the default protected-folder rules still keep GUEST from uploading
    check("GUEST is then past the role check", r.status === 403 && !/GUEST accounts/.test(r.text), show(r));
    const guestUser = await prisma.user.findUnique({ where: { username: "e2e_guest" } });
    const guestInbox = await prisma.inbox.create({ data: { id: "G".repeat(24), title: "g", targetPath: "/shared", userId: guestUser.id } });

    r = await call("PUT", "/api/admin/inboxes", { cookie: admin, body: { allowNoExpiry: false } });
    check("admin requires an expiry", r.status === 200, show(r));
    r = await create(alice, { title: "n", targetPath: "/alice", expiresInDays: null });
    check("a link without expiry is then refused", r.status === 400, show(r));

    r = await call("PUT", "/api/admin/inboxes", { cookie: admin, body: { enabled: false } });
    check("admin switches the feature off", r.status === 200 && r.json?.settings?.enabled === false, show(r));
    r = await create(alice, { title: "n", targetPath: "/alice" });
    check("nobody can create while it is off", r.status === 403, show(r));
    r = await call("GET", `/api/public/inbox/${basic.id}`);
    check("links answer 404 while it is off", r.status === 404, show(r));
    r = await call("PUT", "/api/admin/inboxes", { cookie: admin, body: { enabled: true, allowNoExpiry: true, roles: ["ADMIN", "USER"] } });
    check("admin switches it back on", r.status === 200, show(r));
    r = await call("GET", `/api/public/inbox/${guestInbox.id}`);
    check("a GUEST's link stops working when GUEST is taken out of the roles", r.status === 404, show(r));
    r = await call("GET", `/api/public/inbox/${basic.id}`);
    check("other links work again", r.status === 200, show(r));

    r = await call("PATCH", `/api/admin/inboxes/${basic.id}`, { cookie: admin, body: { closed: true } });
    check("admin pauses someone's link", r.status === 200 && (await prisma.inbox.findUnique({ where: { id: basic.id } }))?.closedAt !== null, show(r));
    r = await call("PATCH", `/api/admin/inboxes/${basic.id}`, { cookie: alice, body: { closed: false } });
    check("non-admin cannot use the admin pause -> 403", r.status === 403, show(r));
    r = await call("PATCH", `/api/admin/inboxes/${"A".repeat(24)}`, { cookie: admin, body: { closed: true } });
    check("admin pause of an unknown link -> 404", r.status === 404, show(r));

    // --- delete ---
    r = await call("DELETE", `/api/user/inboxes/${basic.id}`, { cookie: alice });
    check("owner deletes it", r.status === 200 && (await prisma.inbox.findUnique({ where: { id: basic.id } })) === null, show(r));
    r = await call("GET", `/api/public/inbox/${basic.id}`);
    check("a deleted link answers 404", r.status === 404, show(r));
} finally {
    await prisma.$disconnect();
}

process.exit(failures ? 1 : 0);
