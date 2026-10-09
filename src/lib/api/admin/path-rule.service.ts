import { FileAction, RuleRole } from "@/lib/security/file-actions";

export type PathRuleItem = {
    id: string;
    path: string;
    role: RuleRole;
    actions: FileAction[];
    recursive: boolean;
    note: string | null;
    isDefault: boolean;
};

export type PathRuleInput = {
    path: string;
    role: RuleRole;
    actions: FileAction[];
    recursive: boolean;
    note?: string;
};

export type PathRuleListResponse = {
    rules: PathRuleItem[];
    systemProtected: string[];
};

const API = "/api/admin/path-rules";

async function readJson<T>(res: Response): Promise<T> {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }
    return data as T;
}

export async function fetchPathRules(): Promise<PathRuleListResponse> {
    return readJson<PathRuleListResponse>(await fetch(API));
}

export async function savePathRule(input: PathRuleInput) {
    return readJson<{ success: boolean; rule: PathRuleItem }>(
        await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        })
    );
}

export async function deletePathRule(id: string) {
    const params = new URLSearchParams({ id });
    return readJson<{ success: boolean }>(await fetch(`${API}?${params.toString()}`, { method: "DELETE" }));
}

export async function restoreDefaultPathRules() {
    return readJson<{ success: boolean }>(await fetch(`${API}/reset`, { method: "POST" }));
}

export async function fetchCurrentRole(): Promise<RuleRole | null> {
    try {
        const res = await fetch("/api/auth/user-check");
        if (!res.ok) return null;
        const data = await res.json();
        return data.role ?? null;
    } catch {
        return null;
    }
}
