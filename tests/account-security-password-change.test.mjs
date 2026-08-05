import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createAccountPasswordCommitment,
  hasEmailPasswordProvider,
  performAccountPasswordChange,
} from "../app/lib/security/account-password-change.mjs";
import { MemoryAuthAbuseTestStore } from "../app/lib/security/auth-abuse/memory-test-store.ts";
import { getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const secret = "account-security-test-secret-longer-than-thirty-two-characters";

function authMock({ reauthError = null, reauthSession = {}, reauthUserId = "user-one", signOutError = null, updateError = null } = {}) {
  const calls = [];
  return {
    calls,
    email: "private-placeholder@example.invalid",
    async signInWithPassword(credentials) {
      calls.push(["reauthenticate", credentials]);
      return { data: { session: reauthSession, user: reauthUserId ? { id: reauthUserId } : null }, error: reauthError };
    },
    async signOut(options) { calls.push(["signOut", options]); return { error: signOutError }; },
    async updateUser(attributes) { calls.push(["update", attributes]); return { error: updateError }; },
  };
}

test("correct current password reauthenticates the same user, updates once, and invalidates other sessions", async () => {
  const auth = authMock();
  const result = await performAccountPasswordChange({ auth, currentPassword: "correct-current-password", expectedUserId: "user-one", newPassword: "different-new-password" });
  assert.deepEqual(result, { outcome: "completed", otherSessionsSignedOut: true });
  assert.deepEqual(auth.calls.map(([name]) => name), ["reauthenticate", "update", "signOut"]);
  assert.deepEqual(auth.calls[2], ["signOut", { scope: "others" }]);
});

test("incorrect current password and insufficient fresh sessions cannot update", async () => {
  const incorrect = authMock({ reauthError: { code: "invalid_credentials", status: 400 } });
  assert.deepEqual(await performAccountPasswordChange({ auth: incorrect, currentPassword: "wrong-current-password", expectedUserId: "user-one", newPassword: "different-new-password" }), { outcome: "current_password_invalid" });
  assert.equal(incorrect.calls.some(([name]) => name === "update"), false);

  const providerBlocked = authMock({ reauthError: { code: "captcha_failed", status: 400 } });
  assert.deepEqual(await performAccountPasswordChange({ auth: providerBlocked, currentPassword: "correct-current-password", expectedUserId: "user-one", newPassword: "different-new-password" }), { outcome: "provider_failure" });
  assert.equal(providerBlocked.calls.some(([name]) => name === "update"), false);

  const staleOnly = authMock({ reauthSession: null });
  assert.deepEqual(await performAccountPasswordChange({ auth: staleOnly, currentPassword: "correct-current-password", expectedUserId: "user-one", newPassword: "different-new-password" }), { outcome: "identity_mismatch" });
  assert.equal(staleOnly.calls.some(([name]) => name === "update"), false);
  assert.deepEqual(staleOnly.calls.at(-1), ["signOut", { scope: "local" }]);
});

test("reauthentication can never switch the operation to another account", async () => {
  const auth = authMock({ reauthUserId: "other-user" });
  assert.deepEqual(await performAccountPasswordChange({ auth, currentPassword: "correct-current-password", expectedUserId: "user-one", newPassword: "different-new-password" }), { outcome: "identity_mismatch" });
  assert.equal(auth.calls.some(([name]) => name === "update"), false);
  assert.deepEqual(auth.calls.at(-1), ["signOut", { scope: "local" }]);
});

test("OAuth-only users are identified without inventing a current password", () => {
  assert.equal(hasEmailPasswordProvider({ app_metadata: { provider: "google", providers: ["google"] } }), false);
  assert.equal(hasEmailPasswordProvider({ app_metadata: { provider: "email", providers: ["email", "google"] } }), true);
  const page = read("app/settings/security/page.tsx");
  assert.match(page, /there is no current Furvise password to enter/);
  assert.match(page, /href="\/forgot-password"/);
});

test("the signed-in endpoint is strict, same-origin, authenticated, bounded, and idempotent", () => {
  const route = read("app/api/account/change-password/route.ts");
  assert.ok(route.indexOf("validatePublicAuthOrigin(request)") < route.indexOf("createServerSupabase()"));
  assert.match(route, /Math\.min\(API_BODY_LIMITS\.standard, 4 \* 1024\)/);
  assert.match(route, /hasOnlyKeys\(body, \["currentPassword", "newPassword", "confirmPassword", "captchaToken"\]\)/);
  assert.match(route, /requireCaptchaToken\(input\.captchaToken\)/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /input\.currentPassword\.length >= 1[\s\S]*input\.currentPassword\.length <= 128/);
  assert.match(route, /validateAuthPassword\(input\.newPassword\)/);
  assert.match(route, /PASSWORD_MISMATCH/);
  assert.match(route, /PASSWORD_REUSED/);
  assert.match(route, /flow: "account_password_change"/);
  assert.match(route, /policy: "ACCOUNT_PASSWORD_CHANGE"/);
  assert.match(route, /payload: \{ currentCommitment, newCommitment \}/);
  assert.doesNotMatch(route, /payload: \{[^}]*Password/);
  assert.equal((route.match(/performAccountPasswordChange\(/g) || []).length, 1);
  assert.ok(route.indexOf("claimPublicAuthOperation({") < route.indexOf("performAccountPasswordChange({"));
  assert.match(route, /idempotencyKey: "active-password-change"/);
  assert.match(route, /active !== "new"[\s\S]*REQUEST_IN_PROGRESS/);
  assert.match(route, /finally \{[\s\S]*releasePublicAuthOperation\(activeClaim\)/);
  const page = read("app/settings/security/page.tsx");
  assert.match(page, /idempotencyKey\.current \|\|= crypto\.randomUUID\(\)/);
  assert.match(page, /disabled=\{saving \|\| \(process\.env\.NODE_ENV === "production" && !captchaToken\)\}/);
});

test("password-change rate limiting is dedicated and fail closed", () => {
  const policy = getRateLimitPolicy("ACCOUNT_PASSWORD_CHANGE", { NODE_ENV: "production" });
  assert.equal(policy.failurePolicy, "fail_closed");
  assert.deepEqual(policy.user, { limit: 5, windowMs: 15 * 60_000 });
  assert.deepEqual(policy.ip, { limit: 20, windowMs: 15 * 60_000 });
});

test("the one-time replay claim admits one concurrent password-change execution", async () => {
  const store = new MemoryAuthAbuseTestStore();
  const input = { fingerprint: "c".repeat(64), key: `furvise:v1:auth:operation:account_password_change:${"a".repeat(64)}:${"b".repeat(64)}`, ttlMs: 600_000 };
  const outcomes = await Promise.all([store.claim(input), store.claim(input)]);
  assert.deepEqual(outcomes.sort(), ["new", "replay"]);
});

test("passwords, identity values, and credentials are absent from stored commitments and diagnostics", () => {
  const password = "unique-sensitive-password";
  const commitment = createAccountPasswordCommitment(password, secret);
  assert.match(commitment, /^[a-f0-9]{64}$/);
  assert.equal(commitment.includes(password), false);
  const route = read("app/api/account/change-password/route.ts");
  const logger = read("app/lib/operations/events/logger.ts");
  const abuseKeys = read("app/lib/security/auth-abuse/keys.ts");
  const rateKeys = read("app/lib/security/rate-limit/keys.ts");
  const diagnostic = route.slice(route.indexOf("function emitResult"));
  assert.doesNotMatch(route, /console\.(?:log|info|warn|error)|metadata:|cookie:|authorization:/i);
  assert.match(logger, /actor: safeOperationalIdentifier\(input\.actorId\)/);
  assert.match(abuseKeys, /emailHash = hmac/);
  assert.match(abuseKeys, /keyHash = hmac/);
  assert.match(rateKeys, /userHash = hashRateLimitIdentity/);
  assert.match(rateKeys, /ipHash = hashRateLimitIdentity/);
  assert.doesNotMatch(route, /beginIdempotentRateLimitedOperation|claimIdempotentOperation/);
  assert.doesNotMatch(diagnostic, /(?:password|email|ip|cookie|session|authorization)\s*:/i);
});

test("recovery authorization and normal signed-in password changes remain non-interchangeable", () => {
  const signedInRoute = read("app/api/account/change-password/route.ts");
  const recoveryRoute = read("app/api/auth/update-password/route.ts");
  assert.doesNotMatch(signedInRoute, /RecoveryAuthorization|RECOVERY_AUTH_COOKIE|recovery-authorization/);
  assert.match(signedInRoute, /signInWithPassword/);
  assert.match(recoveryRoute, /readRecoveryAuthorizationCookie/);
  assert.match(recoveryRoute, /inspectRecoveryAuthorization/);
  assert.doesNotMatch(recoveryRoute, /currentPassword|account\.password-change/);
});

test("Security is a private, navigable account surface and update-password stays out of navigation", () => {
  const header = read("app/components/signed-in-header.tsx");
  const privateRoutes = read("app/lib/security/private-routes.ts");
  const navigation = read("app/lib/navigation/mobile-navigation.ts");
  const page = read("app/settings/security/page.tsx");
  assert.match(header, /href: "\/settings\/security"[\s\S]*label: "Security"/);
  assert.match(privateRoutes, /"\/settings"/);
  assert.match(navigation, /"\/settings"/);
  assert.match(page, /Current password/);
  assert.match(page, /Confirm new password/);
  assert.match(page, /Show/);
  assert.doesNotMatch(`${header}\n${navigation}\n${read("app/account/page.tsx")}`, /href[:=]\s*["']\/update-password/);
});
