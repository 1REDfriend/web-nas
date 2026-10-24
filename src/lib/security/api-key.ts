import { timingSafeEqual } from "crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FileAccessError, normalizeVirtualPath } from "./path-guard";
import {
    ApiScope,
    generateApiKey,
    hashApiKey,
    isInsideKeyRoot,
    parseApiKey,
    parseScopes,
    serializeScopes,
} from "./api-key-format";

// API keys let another program call /api/v1 as one user, without a login session.
// A key never grants more than its owner has: every file access still goes through
// path-guard with the owner's role, and is further limited by the key's scopes and rootPath.

const NAME_MAX_LENGTH = 64;
// Write lastUsedAt at most this often per key
const LAST_USED_REFRESH_MS = 60 * 1000;
// A new prefix collides with an existing one about once in 4 billion keys
const CREATE_ATTEMPTS = 3;

// GUEST accounts cannot create or use API keys
export function canUseApiKeys(role: Role): boolean {
    return role === "ADMIN" || role === "USER";
}

export type ApiKeyPrincipal = {
    keyId: string;
    prefix: string;
    userId: string;
    username: string;
    role: Role;
    mustChangePassword: boolean;
    scopes: ApiScope[];
    rootPath: string | null;
    maxUploadBytes: bigint | null;
};

export type CreateApiKeyInput = {
    userId: string;
    name: string;
    scopes: readonly string[];
    rootPath?: string | null;
    expiresAt?: Date | null;
    maxUploadBytes?: bigint | null;
};

function sameHash(a: string, b: string): boolean {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
}

function isUniqueViolation(err: unknown): boolean {
    return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// Checks the input only. The caller must still confirm the owner can reach rootPath.
// Returns the full key once; it cannot be recovered later.
export async function createApiKey(input: CreateApiKeyInput) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > NAME_MAX_LENGTH) {
        throw new FileAccessError("Invalid key name", 400);
    }

    const scopes = parseScopes(input.scopes);
    if (scopes.length === 0) {
        throw new FileAccessError("Pick at least one scope", 400);
    }

    const rootPath = input.rootPath ? normalizeVirtualPath(input.rootPath) : null;

    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
        throw new FileAccessError("Expiry must be in the future", 400);
    }

    if (input.maxUploadBytes !== undefined && input.maxUploadBytes !== null && input.maxUploadBytes <= BigInt(0)) {
        throw new FileAccessError("Invalid upload size limit", 400);
    }

    for (let attempt = 1; ; attempt++) {
        const { fullKey, prefix, keyHash } = generateApiKey();
        try {
            const key = await prisma.apiKey.create({
                data: {
                    userId: input.userId,
                    name,
                    prefix,
                    keyHash,
                    scopes: serializeScopes(scopes),
                    rootPath,
                    expiresAt: input.expiresAt ?? null,
                    maxUploadBytes: input.maxUploadBytes ?? null,
                },
            });
            return { key, fullKey };
        } catch (err: unknown) {
            if (!isUniqueViolation(err) || attempt >= CREATE_ATTEMPTS) throw err;
        }
    }
}

// Returns who the key acts as, or null for a malformed, unknown, revoked or expired key
export async function verifyApiKey(raw: string | null | undefined, clientIp?: string): Promise<ApiKeyPrincipal | null> {
    const parsed = parseApiKey(raw);
    if (!parsed || !raw) return null;

    const key = await prisma.apiKey.findUnique({
        where: { prefix: parsed.prefix },
        include: { user: { select: { id: true, username: true, role: true, mustChangePassword: true } } },
    });

    const now = Date.now();
    if (
        !key ||
        !sameHash(key.keyHash, hashApiKey(raw)) ||
        key.revokedAt !== null ||
        (key.expiresAt !== null && key.expiresAt.getTime() <= now)
    ) {
        return null;
    }

    if (!key.lastUsedAt || now - key.lastUsedAt.getTime() >= LAST_USED_REFRESH_MS) {
        await prisma.apiKey.updateMany({
            where: { id: key.id },
            data: { lastUsedAt: new Date(now), lastUsedIp: clientIp?.slice(0, 64) ?? null },
        });
    }

    return {
        keyId: key.id,
        prefix: key.prefix,
        userId: key.user.id,
        username: key.user.username,
        role: key.user.role,
        mustChangePassword: key.user.mustChangePassword,
        scopes: parseScopes(key.scopes),
        rootPath: key.rootPath,
        maxUploadBytes: key.maxUploadBytes,
    };
}

export async function listApiKeys(userId: string) {
    return prisma.apiKey.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            prefix: true,
            scopes: true,
            rootPath: true,
            maxUploadBytes: true,
            lastUsedAt: true,
            lastUsedIp: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
        },
    });
}

// Only the owner's own keys; returns false when there was nothing to revoke
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    const result = await prisma.apiKey.updateMany({
        where: { id: keyId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    return result.count > 0;
}

export async function revokeAllApiKeys(userId: string): Promise<number> {
    const result = await prisma.apiKey.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    return result.count;
}

export function requireScope(principal: Pick<ApiKeyPrincipal, "scopes">, scope: ApiScope) {
    if (!principal.scopes.includes(scope)) {
        throw new FileAccessError(`This API key is missing the "${scope}" scope`, 403);
    }
}

// Lexical check on the virtual path; path-guard still resolves symlinks for the real access check
export function requireInsideKeyRoot(principal: Pick<ApiKeyPrincipal, "rootPath">, virtualPath: string) {
    if (!isInsideKeyRoot(normalizeVirtualPath(virtualPath), principal.rootPath)) {
        throw new FileAccessError("This API key cannot reach that path", 403);
    }
}
