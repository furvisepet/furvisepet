import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getRateLimitBackendConfig, getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";
import { createRateLimitKeys, fingerprintRateLimitPayload, hashRateLimitIdentity, normalizeIpAddress, resolveClientIp } from "../app/lib/security/rate-limit/keys.ts";
import { MemoryRateLimitTestAdapter } from "../app/lib/security/rate-limit/memory-test-adapter.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const secret = "s2b-test-hash-secret-with-at-least-32-characters";
const requestId = "00000000-0000-4000-8000-000000000001";

function keys(policy, userId, ipAddress, idempotencyKey) {
  return createRateLimitKeys({ hashSecret: secret, idempotencyKey, ipAddress, policy, userId });
}

async function checkDimension(adapter, { dedupeKey, fingerprint, key, limit, nowMs = 1_000, suffix = "x", windowMs = 60_000 }) {
  return adapter.check({ dedupeKey, fingerprint, key, limit, member: `${nowMs}:${suffix}`, nowMs, windowMs });
}

test("central policy registry contains the S2B defaults and bounded browsing policy", () => {
  const expected = {
    ASK_AI: [10, 30], PRODUCT_GUIDANCE_AI: [10, 30], SAFETY_FOLLOWUP_AI: [10, 30], VET_BRIEF_AI: [4, 12],
    MEMORY_WRITE: [30, 60], PROFILE_WRITE: [30, 60], CARE_WRITE: [30, 60], CONVERSATION_WRITE: [30, 60], CATALOG_READ: [120, 240],
  };
  for (const [name, [user, ip]] of Object.entries(expected)) {
    const policy = getRateLimitPolicy(name);
    assert.equal(policy.user.limit, user, name);
    assert.equal(policy.ip.limit, ip, name);
  }
  assert.equal(getRateLimitPolicy("DESTRUCTIVE_WRITE").failurePolicy, "fail_closed");
});

test("environment overrides are centralized and constrained to safe bounds", () => {
  assert.equal(getRateLimitPolicy("ASK_AI", { FURVISE_RATE_LIMIT_ASK_AI_USER_PER_MINUTE: "11" }).user.limit, 11);
  assert.equal(getRateLimitPolicy("ASK_AI", { FURVISE_RATE_LIMIT_ASK_AI_USER_PER_MINUTE: "9999" }).user.limit, 10);
  assert.equal(getRateLimitBackendConfig({ FURVISE_RATE_LIMIT_TIMEOUT_MS: "99999" }).timeoutMs, 800);
  assert.equal(getRateLimitBackendConfig({ FURVISE_RATE_LIMIT_TIMEOUT_MS: "200" }).timeoutMs, 200);
});

test("a user succeeds under the limit and is denied after the rolling limit", async () => {
  const adapter = new MemoryRateLimitTestAdapter();
  const key = keys("ASK_AI", "user-a", "203.0.113.10").userKey;
  for (let index = 0; index < 10; index += 1) assert.equal((await checkDimension(adapter, { key, limit: 10, suffix: String(index) })).allowed, true);
  const denied = await checkDimension(adapter, { key, limit: 10, suffix: "denied" });
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterMs > 0);
});

test("an IP bucket is shared by different users while user buckets remain independent", async () => {
  const adapter = new MemoryRateLimitTestAdapter();
  const left = keys("ASK_AI", "user-a", "203.0.113.10");
  const right = keys("ASK_AI", "user-b", "203.0.113.10");
  assert.equal(left.ipKey, right.ipKey);
  assert.notEqual(left.userKey, right.userKey);
  for (let index = 0; index < 30; index += 1) assert.equal((await checkDimension(adapter, { key: left.ipKey, limit: 30, suffix: String(index) })).allowed, true);
  assert.equal((await checkDimension(adapter, { key: right.ipKey, limit: 30, suffix: "blocked" })).allowed, false);
});

test("the same user across different IPs retains one user bucket", () => {
  const left = keys("ASK_AI", "user-a", "203.0.113.10");
  const right = keys("ASK_AI", "user-a", "2001:db8::1");
  assert.equal(left.userKey, right.userKey);
  assert.notEqual(left.ipKey, right.ipKey);
});

test("IP normalization and forwarding trust reject attacker-controlled headers", () => {
  assert.equal(normalizeIpAddress("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeIpAddress("2001:0DB8:0:0:0:0:0:1"), normalizeIpAddress("2001:db8::1"));
  assert.equal(normalizeIpAddress("not-an-ip"), null);
  const forged = new Request("https://furvise.test/api/ask", { headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.equal(resolveClientIp(forged, { platform: "untrusted" }), null);
  const ambiguous = new Request("https://furvise.test/api/ask", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "x-vercel-id": "test" } });
  assert.equal(resolveClientIp(ambiguous, { platform: "vercel" }), null);
  const trusted = new Request("https://furvise.test/api/ask", { headers: { "x-real-ip": "203.0.113.9", "x-vercel-id": "test" } });
  assert.equal(resolveClientIp(trusted, { platform: "vercel" }), "203.0.113.9");
});

test("rate-limit keys and hashes never expose raw IP or user identity", () => {
  const generated = keys("ASK_AI", "private-user-id", "203.0.113.10", requestId);
  for (const value of Object.values(generated).filter((item) => typeof item === "string")) {
    assert.doesNotMatch(value, /203\.0\.113\.10|private-user-id/);
  }
  assert.equal(hashRateLimitIdentity("ip:203.0.113.10", secret), hashRateLimitIdentity("ip:203.0.113.10", secret));
});

test("exact idempotent retry reuses admission and changed payload conflicts", async () => {
  const adapter = new MemoryRateLimitTestAdapter();
  const generated = keys("ASK_AI", "user-a", "203.0.113.10", requestId);
  const firstFingerprint = fingerprintRateLimitPayload({ petId: "pet-a", question: "hello" });
  const first = await checkDimension(adapter, { dedupeKey: generated.userDedupeKey, fingerprint: firstFingerprint, key: generated.userKey, limit: 10 });
  const retry = await checkDimension(adapter, { dedupeKey: generated.userDedupeKey, fingerprint: firstFingerprint, key: generated.userKey, limit: 10, suffix: "retry" });
  const conflict = await checkDimension(adapter, { dedupeKey: generated.userDedupeKey, fingerprint: fingerprintRateLimitPayload({ petId: "pet-a", question: "different" }), key: generated.userKey, limit: 10, suffix: "conflict" });
  assert.equal(first.reused, false);
  assert.equal(retry.reused, true);
  assert.equal(conflict.conflict, true);
});

test("new idempotency keys remain subject to the normal bucket limit", async () => {
  const adapter = new MemoryRateLimitTestAdapter();
  for (let index = 0; index < 10; index += 1) {
    const generated = keys("ASK_AI", "user-a", "203.0.113.10", `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    assert.equal((await checkDimension(adapter, { dedupeKey: generated.userDedupeKey, fingerprint: "same", key: generated.userKey, limit: 10, suffix: String(index) })).allowed, true);
  }
  const next = keys("ASK_AI", "user-a", "203.0.113.10", "00000000-0000-4000-8000-999999999999");
  assert.equal((await checkDimension(adapter, { dedupeKey: next.userDedupeKey, fingerprint: "same", key: next.userKey, limit: 10 })).allowed, false);
});

test("shared AI lease rejects Ask plus Product for one user but not another", async () => {
  const adapter = new MemoryRateLimitTestAdapter();
  const ask = keys("ASK_AI", "user-a", null);
  const product = keys("PRODUCT_GUIDANCE_AI", "user-a", null);
  const other = keys("ASK_AI", "user-b", null);
  assert.equal(ask.leaseKey, product.leaseKey);
  assert.notEqual(ask.leaseKey, other.leaseKey);
  assert.equal((await adapter.acquireLease({ key: ask.leaseKey, ownerToken: "holder-a", ttlMs: 65_000 })).acquired, true);
  assert.equal((await adapter.acquireLease({ key: product.leaseKey, ownerToken: "holder-product", ttlMs: 65_000 })).acquired, false);
  assert.equal((await adapter.acquireLease({ key: other.leaseKey, ownerToken: "holder-b", ttlMs: 65_000 })).acquired, true);
});

test("only the holder releases a lease and success release permits the next request", async () => {
  const adapter = new MemoryRateLimitTestAdapter();
  const key = keys("ASK_AI", "user-a", null).leaseKey;
  await adapter.acquireLease({ key, ownerToken: "holder", ttlMs: 65_000 });
  assert.equal(await adapter.releaseLease({ key, ownerToken: "attacker" }), false);
  assert.equal((await adapter.acquireLease({ key, ownerToken: "second", ttlMs: 65_000 })).acquired, false);
  assert.equal(await adapter.releaseLease({ key, ownerToken: "holder" }), true);
  assert.equal((await adapter.acquireLease({ key, ownerToken: "second", ttlMs: 65_000 })).acquired, true);
});

test("lease expires after a simulated crashed worker", async () => {
  let now = 1_000;
  const adapter = new MemoryRateLimitTestAdapter(() => now);
  const key = keys("VET_BRIEF_AI", "user-a", null).leaseKey;
  assert.equal((await adapter.acquireLease({ key, ownerToken: "crashed", ttlMs: 90_000 })).acquired, true);
  now += 90_001;
  assert.equal((await adapter.acquireLease({ key, ownerToken: "recovery", ttlMs: 90_000 })).acquired, true);
});

test("Redis adapter uses atomic admission, holder-only release, bounded timeout, and no retries", () => {
  const source = read("app/lib/security/rate-limit/redis-adapter.ts");
  assert.match(source, /ZREMRANGEBYSCORE/);
  assert.match(source, /redis\.call\('SET',[\s\S]*'PX',[\s\S]*'NX'/);
  assert.match(source, /redis\.call\('GET', KEYS\[1\]\) == ARGV\[1\]/);
  assert.match(source, /AbortSignal\.timeout\(input\.timeoutMs\)/);
  assert.match(source, /retries: 0/);
});

test("backend failure policy is fail-closed for AI and destructive writes but fail-open for ordinary writes", () => {
  for (const name of ["ASK_AI", "PRODUCT_GUIDANCE_AI", "SAFETY_FOLLOWUP_AI", "VET_BRIEF_AI", "DESTRUCTIVE_WRITE"]) assert.equal(getRateLimitPolicy(name).failurePolicy, "fail_closed", name);
  for (const name of ["PROFILE_WRITE", "MEMORY_WRITE", "CARE_WRITE", "CONVERSATION_WRITE", "CATALOG_READ"]) assert.equal(getRateLimitPolicy(name).failurePolicy, "fail_open", name);
  const source = read("app/lib/security/rate-limit/rate-limit.ts");
  assert.match(source, /failurePolicy === "fail_open"/);
  assert.match(source, /RATE_LIMIT_UNAVAILABLE/);
  assert.doesNotMatch(source, /MemoryRateLimitTestAdapter/);
});

test("HTTP contracts are stable, private, and do not expose limiter internals", () => {
  const source = read("app/lib/security/rate-limit/errors.ts");
  assert.match(source, /RATE_LIMITED/);
  assert.match(source, /AI_REQUEST_ALREADY_ACTIVE/);
  assert.match(source, /"Retry-After"/);
  assert.match(source, /PRIVATE_CACHE_HEADERS/);
  assert.match(source, /status: 409/);
  assert.doesNotMatch(source, /Redis|Upstash|raw IP/i);
});

test("all model-backed routes use central policy and release a shared lease in finally", () => {
  const routes = {
    "app/api/ask/route.ts": "ASK_AI",
    "app/api/analyze/route.ts": "PRODUCT_GUIDANCE_AI",
    "app/api/safety-followup/route.ts": "SAFETY_FOLLOWUP_AI",
    "app/api/shop/interpret-query/route.ts": "PRODUCT_GUIDANCE_AI",
    "app/api/shop/explain-product-fit/route.ts": "PRODUCT_GUIDANCE_AI",
    "app/api/shop/product-question/route.ts": "PRODUCT_GUIDANCE_AI",
    "app/api/vet-briefs/draft/route.ts": "VET_BRIEF_AI",
  };
  for (const [path, policy] of Object.entries(routes)) {
    const source = read(path);
    assert.match(source, new RegExp(`policy: "${policy}"`), path);
    assert.match(source, /requireRateLimitedRequest/, path);
    assert.match(source, /finally[\s\S]*\.release\(\)/, path);
  }
});

test("AI admission precedes credit reservation and provider execution", () => {
  const ask = read("app/api/ask/route.ts");
  assert.ok(ask.indexOf("requireRateLimitedRequest({") < ask.indexOf("reserveAiCredit({"));
  const product = read("app/api/shop/product-question/route.ts");
  assert.ok(product.indexOf("requireRateLimitedRequest({") < product.indexOf("runWithAiCredit<"));
  const vet = read("app/api/vet-briefs/draft/route.ts");
  assert.ok(vet.indexOf("requireRateLimitedRequest({") < vet.indexOf("runWithAiCredit<"));
});

test("write routes are owner-scoped and use central write policies", () => {
  const routes = [
    ["app/lib/pet-profile-api-server.ts", "PROFILE_WRITE"], ["app/api/pets/[id]/route.ts", "DESTRUCTIVE_WRITE"],
    ["app/api/care-entries/route.ts", "CARE_WRITE"], ["app/api/care-entries/[id]/route.ts", "DESTRUCTIVE_WRITE"],
    ["app/api/legacy-memories/route.ts", "MEMORY_WRITE"], ["app/api/memories/[id]/route.ts", "MEMORY_WRITE"],
    ["app/api/ask/conversations/route.ts", "CONVERSATION_WRITE"], ["app/api/ask/conversations/[id]/route.ts", "CONVERSATION_WRITE"],
    ["app/api/vet-briefs/route.ts", "CARE_WRITE"], ["app/api/account/detect-country/route.ts", "PROFILE_WRITE"],
    ["app/api/account/product-country/route.ts", "PROFILE_WRITE"],
  ];
  for (const [path, policy] of routes) {
    const source = read(path);
    assert.match(source, new RegExp(`"${policy}"`), path);
    assert.match(source, /beginRateLimitedRequest/, path);
    assert.match(source, /userId/, path);
  }
});

test("browser profile, memory, and care writes cross authenticated API gateways", () => {
  const source = read("app/lib/supabase.ts");
  assert.match(source, /authenticatedApiFetch\(existingProfileId \? `\/api\/pets/);
  assert.match(source, /authenticatedApiFetch\("\/api\/care-entries"/);
  assert.match(source, /authenticatedApiFetch\("\/api\/legacy-memories"/);
  assert.match(source, /headers\.set\("authorization", `Bearer \$\{token\}`\)/);
});

test("deterministic product paths remain before AI gating and catalog has a high bounded policy", () => {
  const interpret = read("app/api/shop/interpret-query/route.ts");
  assert.ok(interpret.indexOf("cached") < interpret.indexOf("requireRateLimitedRequest({"));
  const question = read("app/api/shop/product-question/route.ts");
  assert.ok(question.indexOf("offTopic") < question.indexOf("requireRateLimitedRequest({"));
  assert.match(read("app/api/shop/catalog/route.ts"), /policy: "CATALOG_READ"/);
});

test("configuration examples keep Redis credentials server-only", () => {
  const example = read(".env.example");
  assert.match(example, /UPSTASH_REDIS_REST_URL=/);
  assert.match(example, /UPSTASH_REDIS_REST_TOKEN=/);
  assert.match(example, /FURVISE_RATE_LIMIT_HASH_SECRET=/);
  assert.doesNotMatch(example, /NEXT_PUBLIC_UPSTASH|NEXT_PUBLIC_FURVISE_RATE_LIMIT_HASH_SECRET/);
  assert.equal(JSON.parse(read("package.json")).dependencies["@upstash/redis"], "1.38.0");
});
