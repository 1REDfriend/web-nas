import type { ApiScope } from "@/lib/security/api-key-format";

export type ApiKeyStatus = "active" | "revoked" | "expired";

export type ApiKeyInfo = {
    id: string;
    name: string;
    prefix: string;
    scopes: ApiScope[];
    rootPath: string | null;
    maxUploadBytes: string | null;
    lastUsedAt: string | null;
    lastUsedIp: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    status: ApiKeyStatus;
};

export type CreateApiKeyBody = {
    name: string;
    scopes: ApiScope[];
    rootPath: string | null;
    expiresInDays: number | null;
    maxUploadMB: number | null;
};

export type CreatedApiKey = {
    key: Pick<ApiKeyInfo, "id" | "name" | "prefix" | "scopes" | "rootPath" | "maxUploadBytes" | "expiresAt" | "createdAt">;
    // The full key: shown once, never stored by the server
    secret: string;
};

async function readJson(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
}

export async function fetchApiKeys(): Promise<ApiKeyInfo[]> {
    const data = await readJson(await fetch("/api/user/api-keys", { cache: "no-store" }));
    return data.keys ?? [];
}

export async function createApiKeyRequest(body: CreateApiKeyBody): Promise<CreatedApiKey> {
    return readJson(
        await fetch("/api/user/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
    );
}

export async function revokeApiKeyRequest(id: string): Promise<void> {
    await readJson(await fetch(`/api/user/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function revokeAllApiKeysRequest(): Promise<number> {
    const data = await readJson(await fetch("/api/user/api-keys/revoke-all", { method: "POST" }));
    return data.revoked ?? 0;
}
