import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ELIGIBLE_INTERACTIVE_AUTH_METHODS,
  RECENT_INTERACTIVE_AUTH_MAX_AGE_SECONDS,
  assessRecentInteractiveAuthentication,
} from "../app/lib/security/recent-interactive-auth.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const nowMs = Date.parse("2026-08-23T12:00:00.000Z");
const nowSeconds = Math.floor(nowMs / 1_000);
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

function claims(method = "password", timestamp = nowSeconds - 60, overrides = {}) {
  return { amr: [{ method, timestamp }], iat: nowSeconds, session_id: sessionId, sub: userId, ...overrides };
}

test("each supported interactive AMR can establish recent auth", () => {
  assert.deepEqual(ELIGIBLE_INTERACTIVE_AUTH_METHODS, [
    "password", "oauth", "otp", "magiclink", "sso/saml", "totp",
    "mfa/totp", "mfa/phone", "mfa/webauthn", "web3", "oauth_provider/authorization_code",
  ]);
  for (const method of ELIGIBLE_INTERACTIVE_AUTH_METHODS) {
    assert.equal(assessRecentInteractiveAuthentication(claims(method), userId, nowMs).allowed, true, method);
  }
});

test("the 15-minute boundary is exact and JWT iat is never authority", () => {
  assert.equal(RECENT_INTERACTIVE_AUTH_MAX_AGE_SECONDS, 900);
  assert.equal(assessRecentInteractiveAuthentication(claims("password", nowSeconds - 900), userId, nowMs).allowed, true);
  assert.deepEqual(
    assessRecentInteractiveAuthentication(claims("password", nowSeconds - 901, { iat: nowSeconds }), userId, nowMs),
    { allowed: false, code: "RECENT_AUTH_REQUIRED", reason: "authentication_stale" },
  );
  assert.equal(assessRecentInteractiveAuthentication(claims("password", nowSeconds + 1), userId, nowMs).allowed, false);
  assert.equal(assessRecentInteractiveAuthentication(claims(), userId, Number.NaN).allowed, false);
});

test("refresh evidence cannot make an old interactive authentication recent", () => {
  const refreshed = claims("password", nowSeconds - 30 * 86_400, {
    amr: [
      { method: "password", timestamp: nowSeconds - 30 * 86_400 },
      { method: "token_refresh", timestamp: nowSeconds },
    ],
    iat: nowSeconds,
  });
  assert.equal(assessRecentInteractiveAuthentication(refreshed, userId, nowMs).allowed, false);
  assert.equal(assessRecentInteractiveAuthentication(claims("token_refresh"), userId, nowMs).allowed, false);
});

test("missing or malformed binding and AMR evidence fail closed", () => {
  for (const candidate of [
    null,
    { sub: userId, session_id: sessionId },
    claims("password", nowSeconds, { amr: ["password"] }),
    claims("password", nowSeconds, { amr: [{ method: "password" }] }),
    claims("password", nowSeconds, { amr: [{ method: "password", timestamp: "recent" }] }),
    claims("password", nowSeconds, { session_id: undefined }),
    claims("password", nowSeconds, { session_id: "not-a-uuid" }),
    claims("password", nowSeconds, { sub: "33333333-3333-4333-8333-333333333333" }),
  ]) {
    assert.equal(assessRecentInteractiveAuthentication(candidate, userId, nowMs).allowed, false);
  }
});

test("recovery and other non-login methods are never eligible", () => {
  for (const method of ["recovery", "invite", "signup", "email_change", "anonymous"]) {
    assert.equal(assessRecentInteractiveAuthentication(claims(method), userId, nowMs).allowed, false, method);
  }
  assert.equal(assessRecentInteractiveAuthentication(claims("password", nowSeconds, {
    amr: [
      { method: "recovery", timestamp: nowSeconds },
      { method: "password", timestamp: nowSeconds },
    ],
  }), userId, nowMs).allowed, false);
  assert.equal(assessRecentInteractiveAuthentication(claims("password", nowSeconds, { is_anonymous: true }), userId, nowMs).allowed, false);
});

test("the pet deletion route verifies exact claims before idempotency or deletion", () => {
  const route = read("app/api/pets/[id]/route.ts");
  const helper = read("app/lib/security/recent-auth.ts");
  const core = read("app/lib/authenticated-api-core.ts");
  assert.match(helper, /getClaims\(input\.accessToken\)/);
  assert.match(helper, /input\.supabase\.auth\.getClaims\(\)/);
  assert.match(core, /accessToken: token \|\| null/);
  assert.ok(route.indexOf("requireRecentInteractiveAuthentication(auth)") < route.indexOf("const gate = await beginIdempotentRateLimitedOperation"));
  assert.ok(route.indexOf("requireRecentInteractiveAuthentication(auth)") < route.indexOf("delete_pet_profile_for_user"));
  assert.match(route, /code: recentAuth\.code/);
  assert.match(route, /status: 401/);
  assert.match(route, /PRIVATE_CACHE_HEADERS/);
});

test("reauthentication returns to the exact pet but never resumes deletion automatically", () => {
  const routing = read("app/lib/auth-routing.ts");
  const login = read("app/login/page.tsx");
  const list = read("app/pets/page.tsx");
  const detail = read("app/pets/[id]/page.tsx");
  const client = read("app/lib/supabase.ts");
  assert.match(routing, /`\/pets\/\$\{encodeURIComponent\(petId\)\}`/);
  assert.match(routing, /reauth=pet-delete/);
  assert.match(client, /code: payload\?\.code/);
  assert.match(list, /router\.push\(buildPetDeletionReauthenticationHref\(profile\.id\)\)/);
  assert.match(detail, /router\.push\(buildPetDeletionReauthenticationHref\(profile\.id\)\)/);
  assert.match(login, /isPetDeleteReauthentication \|\| didRedirectRef\.current/);
  assert.match(login, /Permanent deletion will still require a new confirmation/);
  assert.doesNotMatch(login, /deleteDogProfileForUser|method:\s*["']DELETE["']/);
});

test("account deletion and export use current-session verified AMR before privileged work", () => {
  const deletion = read("app/api/account/delete/route.ts");
  const exportRoute = read("app/api/account/export/route.ts");
  const apiServer = read("app/lib/authenticated-api-server.ts");

  for (const route of [deletion, exportRoute]) {
    assert.match(route, /requireRecentInteractiveAuthentication\(context\)/);
    assert.doesNotMatch(route, /hasRecentAuthentication|last_sign_in_at/);
    assert.match(route, /RECENT_AUTH_REQUIRED|recentAuth\.code/);
    assert.match(route, /status:\s*401/);
    assert.match(route, /private, no-store/);
  }
  assert.ok(deletion.indexOf("requireRecentInteractiveAuthentication(context)") < deletion.indexOf("beginRateLimitedRequest"));
  assert.ok(deletion.indexOf("requireRecentInteractiveAuthentication(context)") < deletion.indexOf("prepare_account_deletion"));
  assert.ok(deletion.indexOf("requireRecentInteractiveAuthentication(context)") < deletion.indexOf("deleteUser"));
  assert.ok(exportRoute.indexOf("requireRecentInteractiveAuthentication(context)") < exportRoute.indexOf("beginIdempotentRateLimitedOperation"));
  assert.ok(exportRoute.indexOf("requireRecentInteractiveAuthentication(context)") < exportRoute.indexOf("buildUserDataExport"));
  assert.match(apiServer, /accessToken: context\.accessToken/);
  assert.match(apiServer, /validateSensitiveRequestOriginResponse/);
  assert.match(deletion, /confirmation[^\n]+!== "DELETE"/);
});
