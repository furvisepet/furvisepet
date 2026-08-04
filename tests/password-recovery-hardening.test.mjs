import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MemoryRecoveryAuthorizationStore } from "../app/lib/security/auth-abuse/memory-recovery-authorization-store.ts";
import { performRecoveryPasswordUpdate } from "../app/lib/security/auth-abuse/recovery-completion.mjs";
import { createRecoveryMarkerIdentity, createRecoveryPasswordCommitment } from "../app/lib/security/auth-abuse/recovery-secrets.mjs";
import { getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";

const secret = "recovery-test-secret-that-is-longer-than-thirty-two-characters";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function authorization(store, userId, marker = "A".repeat(43), operationKey = "operation-one", sessionToken = "recovery-session-token") {
  const identity = createRecoveryMarkerIdentity(marker, userId, sessionToken, secret, operationKey);
  const key = `furvise:v1:auth:recovery-completion:marker:${identity.markerHash}`;
  return {
    identity,
    key,
    issue: () => store.issue({ key, ttlMs: 600_000, userHash: identity.userHash }),
    inspect: () => store.inspect({ key, userHash: identity.userHash }),
    run: (updatePassword) => performRecoveryPasswordUpdate({
      claimAuthorization: () => store.claim({ key, operationHash: identity.operationHash, userHash: identity.userHash }),
      consumeAuthorization: () => store.consume({ key, operationHash: identity.operationHash, userHash: identity.userHash }),
      releaseAuthorization: () => store.release({ key, operationHash: identity.operationHash, userHash: identity.userHash }),
      updatePassword,
    }),
  };
}

test("authoritative Supabase recovery evidence issues a narrow opaque marker", () => {
  const callback = read("app/auth/callback/route.ts");
  const authorizationSource = read("app/lib/security/auth-abuse/recovery-authorization.ts");
  assert.ok(callback.indexOf('redirectType !== "recovery"') < callback.indexOf("issueRecoveryAuthorization(data.user.id, exchangeData.session.access_token)"));
  assert.match(callback, /response\.cookies\.set\(RECOVERY_AUTH_COOKIE/);
  assert.match(authorizationSource, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(authorizationSource, /httpOnly: true/);
  assert.match(authorizationSource, /sameSite: "strict"/);
  assert.match(authorizationSource, /path: "\/api\/auth\/update-password"/);
  assert.match(authorizationSource, /RECOVERY_AUTH_MAX_AGE_SECONDS = 10 \* 60/);
});

test("a valid recovery authorization permits exactly one password update", async () => {
  const store = new MemoryRecoveryAuthorizationStore();
  const auth = authorization(store, "user-valid");
  await auth.issue();
  let providerCalls = 0;
  const first = await auth.run(async () => { providerCalls += 1; return true; });
  const replay = await auth.run(async () => { providerCalls += 1; return true; });
  assert.equal(first.outcome, "completed");
  assert.equal(replay.outcome, "authorization_consumed");
  assert.equal(providerCalls, 1);
  assert.equal(await auth.inspect(), "consumed");
});

test("ordinary, malformed, expired, and consumed recovery states are rejected", async () => {
  let now = 1_000;
  const store = new MemoryRecoveryAuthorizationStore(() => now);
  const valid = authorization(store, "recovery-user");
  await valid.issue();
  const ordinary = authorization(store, "ordinary-session-user");
  const malformed = createRecoveryMarkerIdentity("client-supplied", "recovery-user", "recovery-session-token", secret);
  assert.notEqual(valid.identity.userHash, ordinary.identity.userHash);
  assert.notEqual(valid.identity.markerHash, malformed.markerHash);
  assert.equal(await store.inspect({ key: valid.key, userHash: ordinary.identity.userHash }), "invalid");
  const relogged = authorization(store, "recovery-user", "A".repeat(43), "operation-one", "ordinary-login-session");
  assert.equal(await store.inspect({ key: valid.key, userHash: relogged.identity.userHash }), "invalid");
  assert.equal(await store.inspect({ key: `missing:${malformed.markerHash}`, userHash: valid.identity.userHash }), "expired");
  now += 600_001;
  assert.equal(await valid.inspect(), "expired");
});

test("concurrent recovery submissions cannot stack provider updates", async () => {
  const store = new MemoryRecoveryAuthorizationStore();
  const firstAuth = authorization(store, "user-concurrent", "B".repeat(43), "operation-a");
  const secondAuth = authorization(store, "user-concurrent", "B".repeat(43), "operation-b");
  await firstAuth.issue();
  let releaseProvider;
  const providerWait = new Promise((resolve) => { releaseProvider = resolve; });
  let providerCalls = 0;
  const firstPromise = firstAuth.run(async () => { providerCalls += 1; await providerWait; return true; });
  await new Promise((resolve) => setImmediate(resolve));
  const duplicate = await secondAuth.run(async () => { providerCalls += 1; return true; });
  releaseProvider();
  const first = await firstPromise;
  assert.equal(first.outcome, "completed");
  assert.equal(duplicate.outcome, "in_progress");
  assert.equal(providerCalls, 1);
});

test("provider failure releases an authorization for a safe retry", async () => {
  const store = new MemoryRecoveryAuthorizationStore();
  const firstAuth = authorization(store, "user-retry", "C".repeat(43), "operation-failed");
  const retryAuth = authorization(store, "user-retry", "C".repeat(43), "operation-retry");
  await firstAuth.issue();
  assert.equal((await firstAuth.run(async () => false)).outcome, "provider_failure");
  assert.equal((await retryAuth.run(async () => true)).outcome, "completed");
});

test("password commitments and marker storage contain no recoverable raw inputs", async () => {
  const rawPassword = "Never-store-this-password-123";
  const rawUser = "private-user-id";
  const rawMarker = "D".repeat(43);
  const store = new MemoryRecoveryAuthorizationStore();
  const auth = authorization(store, rawUser, rawMarker);
  await auth.issue();
  const commitment = createRecoveryPasswordCommitment(rawPassword, secret);
  assert.match(commitment, /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify([...store.values.entries()]);
  for (const raw of [rawPassword, rawUser, rawMarker, "recovery-session-token", "person@example.test", "203.0.113.7", "Cookie", "Authorization"]) assert.equal(serialized.includes(raw), false, raw);
  const route = read("app/api/auth/update-password/route.ts");
  assert.match(route, /payload: \{ passwordCommitment \}/);
  assert.doesNotMatch(route, /payload: \{ password(?:\.password)? \}/);
  assert.doesNotMatch(route, /console\.(?:log|info|warn|error)/);
});

test("password completion rate limits fail closed in production", () => {
  const policy = getRateLimitPolicy("AUTH_PASSWORD_UPDATE", { NODE_ENV: "production" });
  assert.equal(policy.failurePolicy, "fail_closed");
  assert.deepEqual(policy.user, { limit: 5, windowMs: 15 * 60_000 });
  assert.deepEqual(policy.ip, { limit: 20, windowMs: 15 * 60_000 });
  const route = read("app/api/auth/update-password/route.ts");
  assert.match(route, /beginRateLimitedRequest/);
  assert.match(route, /enabled: process\.env\.NODE_ENV === "production" \? true : undefined/);
  assert.match(read("app/lib/security/rate-limit/rate-limit.ts"), /failurePolicy === "fail_open"/);
});

test("route keeps origin, strict body, size, password, canonical idempotency, and neutral errors", () => {
  const route = read("app/api/auth/update-password/route.ts");
  assert.ok(route.indexOf("validatePublicAuthOrigin(request)") < route.indexOf("supabase.auth.getUser()"));
  assert.match(route, /readBoundedJson\(request, API_BODY_LIMITS\.standard\)/);
  assert.match(route, /hasOnlyKeys\(body, \["password"\]\)/);
  assert.match(route, /validateAuthPassword/);
  assert.match(route, /resolveIdempotencyKey/);
  assert.match(route, /claimIdempotentOperation/);
  for (const code of ["RECOVERY_AUTH_REQUIRED", "RECOVERY_AUTH_EXPIRED", "RECOVERY_AUTH_INVALID", "RECOVERY_AUTH_CONSUMED", "RECOVERY_UPDATE_IN_PROGRESS", "PASSWORD_INVALID", "PASSWORD_PROVIDER_FAILURE"]) assert.match(route, new RegExp(code));
  assert.match(route, /clearRecoveryAuthorizationCookie/);
});

test("unrelated auth flows do not consume or issue recovery completion markers", () => {
  for (const name of ["login", "signup", "resend", "oauth", "recovery"]) {
    const route = read(`app/api/auth/${name}/route.ts`);
    assert.doesNotMatch(route, /RECOVERY_AUTH_COOKIE|issueRecoveryAuthorization|consumeRecoveryAuthorization/);
  }
});
