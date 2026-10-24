import { NextResponse } from "next/server";
import fs from "fs-extra";
import { prisma } from "@/lib/db";
import { log, logerror } from "@/lib/logger";
import { requireKeyManager } from "@/lib/api/user/api-key-access";
import { createApiKey, listApiKeys } from "@/lib/security/api-key";
import { parseScopes } from "@/lib/security/api-key-format";
import { authorizePath, FileAccessError, fileAccessErrorResponse } from "@/lib/security/path-guard";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXPIRY_DAYS = 3650;
// Active keys per user, so a script gone wrong cannot fill the table
const MAX_ACTIVE_KEYS = 20;
const MB = 1024 * 1024;
// 100 GB, the server-wide upload cap
const MAX_UPLOAD_MB = 100 * 1024;

function keyStatus(key: { revokedAt: Date | null; expiresAt: Date | null }, now: number) {
    if (key.revokedAt) return "revoked";
    if (key.expiresAt && key.expiresAt.getTime() <= now) return "expired";
    return "active";
}

// GET /api/user/api-keys: the caller's own keys, never the secret or its hash
export async function GET() {
    const access = await requireKeyManager();
    if ("response" in access) return access.response;

    try {
        const now = Date.now();
        const keys = await listApiKeys(access.user.id);
        return NextResponse.json({
            keys: keys.map((key) => ({
                ...key,
                scopes: parseScopes(key.scopes),
                maxUploadBytes: key.maxUploadBytes === null ? null : key.maxUploadBytes.toString(),
                status: keyStatus(key, now),
            })),
        });
    } catch (err: unknown) {
        logerror("[API keys list failed] : " + err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

// POST /api/user/api-keys  { name, scopes: string[], rootPath?: string, expiresInDays?: number | null }
// Answers with the full key exactly once.
export async function POST(request: Request) {
    const access = await requireKeyManager();
    if ("response" in access) return access.response;
    const { user } = access;

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }

        const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s: unknown): s is string => typeof s === "string") : [];

        let expiresAt: Date | null = null;
        if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
            const days = Number(body.expiresInDays);
            if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
                return NextResponse.json({ error: `Expiry must be 1 to ${MAX_EXPIRY_DAYS} days, or none` }, { status: 400 });
            }
            expiresAt = new Date(Date.now() + days * DAY_MS);
        }

        let maxUploadBytes: bigint | null = null;
        if (body.maxUploadMB !== undefined && body.maxUploadMB !== null) {
            const mb = Number(body.maxUploadMB);
            if (!Number.isInteger(mb) || mb < 1 || mb > MAX_UPLOAD_MB) {
                return NextResponse.json({ error: `Upload limit must be 1 to ${MAX_UPLOAD_MB} MB, or none` }, { status: 400 });
            }
            maxUploadBytes = BigInt(mb) * BigInt(MB);
        }

        // The key's folder must be one its owner can open today
        let rootPath: string | null = null;
        if (typeof body.rootPath === "string" && body.rootPath.trim() && body.rootPath.trim() !== "/") {
            const folder = await authorizePath(user, body.rootPath.trim(), "VIEW");
            const stats = await fs.stat(folder.physicalPath).catch(() => null);
            if (!stats?.isDirectory()) {
                throw new FileAccessError("That folder does not exist", 400);
            }
            rootPath = folder.virtualPath;
        }

        const active = await prisma.apiKey.count({
            where: { userId: user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        });
        if (active >= MAX_ACTIVE_KEYS) {
            return NextResponse.json({ error: `You can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` }, { status: 409 });
        }

        const { key, fullKey } = await createApiKey({
            userId: user.id,
            name: typeof body.name === "string" ? body.name : "",
            scopes,
            rootPath,
            expiresAt,
            maxUploadBytes,
        });

        log(`[API KEY] created ${key.id} (${key.prefix}) for user ${user.id}`);
        return NextResponse.json(
            {
                key: {
                    id: key.id,
                    name: key.name,
                    prefix: key.prefix,
                    scopes: parseScopes(key.scopes),
                    rootPath: key.rootPath,
                    maxUploadBytes: key.maxUploadBytes === null ? null : key.maxUploadBytes.toString(),
                    expiresAt: key.expiresAt,
                    createdAt: key.createdAt,
                },
                secret: fullKey,
            },
            { status: 201, headers: { "Cache-Control": "no-store" } }
        );
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[API key create failed] : " + err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
