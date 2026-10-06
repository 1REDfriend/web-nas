// In-memory fixed-window counters. Fine for the single-process deployment this app
// targets; a restart resets them.

type Bucket = { count: number; resetAt: number };

const globalForLimits = globalThis as unknown as { rateLimitBuckets?: Map<string, Bucket> };
const buckets = (globalForLimits.rateLimitBuckets ??= new Map<string, Bucket>());

export type LimitRule = { key: string; limit: number; windowMs: number };

function current(key: string, now: number): Bucket | null {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        buckets.delete(key);
        return null;
    }
    return bucket;
}

// Seconds until every rule allows another attempt, or 0 if none is exhausted
export function retryAfterSeconds(rules: LimitRule[], now = Date.now()): number {
    let wait = 0;
    for (const rule of rules) {
        const bucket = current(rule.key, now);
        if (bucket && bucket.count >= rule.limit) {
            wait = Math.max(wait, Math.ceil((bucket.resetAt - now) / 1000));
        }
    }
    return wait;
}

export function recordAttempt(rules: LimitRule[], now = Date.now()) {
    for (const rule of rules) {
        const bucket = current(rule.key, now);
        if (bucket) {
            bucket.count++;
        } else {
            buckets.set(rule.key, { count: 1, resetAt: now + rule.windowMs });
        }
    }

    // Keep the map from growing without bound
    if (buckets.size > 10_000) {
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= now) buckets.delete(key);
        }
    }
}

export function resetLimits(keys: string[]) {
    for (const key of keys) buckets.delete(key);
}

export function getClientIp(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return request.headers.get("x-real-ip") ?? "unknown";
}
