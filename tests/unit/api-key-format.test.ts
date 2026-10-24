import { test } from "node:test";
import assert from "node:assert/strict";
import {
    apiKeyFromAuthorization,
    generateApiKey,
    hashApiKey,
    isInsideKeyRoot,
    parseApiKey,
    parseScopes,
    serializeScopes,
} from "../../src/lib/security/api-key-format.ts";

test("generated keys have the documented layout", () => {
    const { fullKey, prefix, keyHash } = generateApiKey();
    assert.match(fullKey, /^wnas_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
    assert.equal(fullKey.slice(5, 13), prefix);
    assert.equal(keyHash, hashApiKey(fullKey));
    assert.match(keyHash, /^[0-9a-f]{64}$/);
});

test("generated keys are unique and the hash never contains the key", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 500; i++) {
        const { fullKey, keyHash } = generateApiKey();
        assert.ok(!keyHash.includes(fullKey.slice(14)));
        keys.add(fullKey);
    }
    assert.equal(keys.size, 500);
});

test("parseApiKey accepts generated keys and rejects everything else", () => {
    const { fullKey, prefix } = generateApiKey();
    assert.deepEqual(parseApiKey(fullKey), { prefix });

    const secret = fullKey.slice(14);
    for (const bad of [
        undefined,
        null,
        42,
        "",
        "wnas_",
        `WNAS_${prefix}_${secret}`,
        `wnas_${prefix.toUpperCase()}_${secret}`,
        `wnas_${prefix}_${secret}x`,
        `wnas_${prefix}_${secret.slice(1)}`,
        `wnas_${prefix}-${secret}`,
        ` ${fullKey}`,
        `${fullKey}\n`,
        `wnas_${prefix}_${secret.slice(0, 42)}=`,
    ]) {
        assert.equal(parseApiKey(bad), null, `should reject ${JSON.stringify(bad)}`);
    }
});

test("apiKeyFromAuthorization only returns well-formed bearer keys", () => {
    const { fullKey } = generateApiKey();
    assert.equal(apiKeyFromAuthorization(`Bearer ${fullKey}`), fullKey);
    assert.equal(apiKeyFromAuthorization(`bearer   ${fullKey}`), fullKey);
    assert.equal(apiKeyFromAuthorization(null), null);
    assert.equal(apiKeyFromAuthorization(""), null);
    assert.equal(apiKeyFromAuthorization(fullKey), null);
    assert.equal(apiKeyFromAuthorization(`Basic ${fullKey}`), null);
    assert.equal(apiKeyFromAuthorization("Bearer some.jwt.token"), null);
    assert.equal(apiKeyFromAuthorization(`Bearer ${fullKey} extra`), null);
});

test("parseScopes keeps known scopes in a fixed order and drops the rest", () => {
    assert.deepEqual(parseScopes("upload,list"), ["list", "upload"]);
    assert.deepEqual(parseScopes(" READ , delete,read "), ["read", "delete"]);
    assert.deepEqual(parseScopes("admin,*,list"), ["list"]);
    assert.deepEqual(parseScopes(["delete", "bogus"]), ["delete"]);
    assert.deepEqual(parseScopes(""), []);
    assert.deepEqual(parseScopes(null), []);
    assert.equal(serializeScopes(["upload", "list", "upload"]), "list,upload");
});

test("isInsideKeyRoot", () => {
    assert.equal(isInsideKeyRoot("/anything", null), true);
    assert.equal(isInsideKeyRoot("/alice/bot", "/alice/bot"), true);
    assert.equal(isInsideKeyRoot("/alice/bot/a/b.txt", "/alice/bot"), true);
    assert.equal(isInsideKeyRoot("/alice/bot-other", "/alice/bot"), false);
    assert.equal(isInsideKeyRoot("/alice", "/alice/bot"), false);
    assert.equal(isInsideKeyRoot("/bob/x", "/alice/bot"), false);
    assert.equal(isInsideKeyRoot("/", "/alice/bot"), false);
    assert.equal(isInsideKeyRoot("/x", "/"), true);
});
