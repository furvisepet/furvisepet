import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasPasswordAuthCapability,
  reconcilePasswordAuthCapabilityAfterRecovery,
} from "../app/lib/password-capability.ts";
import { performRecoveryPasswordUpdate } from "../app/lib/security/auth-abuse/recovery-completion.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const googleUser = { app_metadata: { provider: "google", providers: ["google"] } };
const emailUser = { app_metadata: { provider: "email", providers: ["email"] } };

test("provider metadata and Furvise state are independent positive password signals", () => {
  assert.equal(hasPasswordAuthCapability(googleUser, null), false);
  assert.equal(hasPasswordAuthCapability(googleUser, "2026-09-02T09:00:00.000Z"), true);
  assert.equal(hasPasswordAuthCapability(emailUser, null), true);
});

test("OAuth-first setup keeps Google metadata while password login and Furvise capability become available", async () => {
  const account = {
    appMetadata: { provider: "google", providers: ["google"] },
    googleIdentityConnected: true,
    passwordCredential: null,
    passwordAuthEnabledAt: null,
  };
  assert.equal(hasPasswordAuthCapability({ app_metadata: account.appMetadata }, account.passwordAuthEnabledAt), false);

  const providerResult = await performRecoveryPasswordUpdate({
    claimAuthorization: async () => "claimed",
    consumeAuthorization: async () => true,
    releaseAuthorization: async () => undefined,
    updatePassword: async () => {
      account.passwordCredential = "provider-stored-credential";
      return true;
    },
  });
  const capabilityResult = await reconcilePasswordAuthCapabilityAfterRecovery({
    outcome: providerResult.outcome,
    recordCapability: async (enabledAt) => {
      account.passwordAuthEnabledAt = enabledAt;
      return true;
    },
    wait: async () => undefined,
  });

  assert.equal(providerResult.outcome, "completed");
  assert.equal(capabilityResult, "recorded");
  assert.equal(hasPasswordAuthCapability({ app_metadata: account.appMetadata }, account.passwordAuthEnabledAt), true);
  assert.equal(account.passwordCredential === "provider-stored-credential", true, "email/password login succeeds");
  assert.equal(account.googleIdentityConnected, true, "Google login remains available");
  assert.deepEqual(account.appMetadata.providers, ["google"], "Supabase provider metadata remains untouched");
});

test("a failed provider update cannot create password capability", async () => {
  let passwordAuthEnabledAt = null;
  const providerResult = await performRecoveryPasswordUpdate({
    claimAuthorization: async () => "claimed",
    consumeAuthorization: async () => true,
    releaseAuthorization: async () => undefined,
    updatePassword: async () => false,
  });
  const capabilityResult = await reconcilePasswordAuthCapabilityAfterRecovery({
    outcome: providerResult.outcome,
    recordCapability: async (enabledAt) => {
      passwordAuthEnabledAt = enabledAt;
      return true;
    },
  });
  assert.equal(providerResult.outcome, "provider_failure");
  assert.equal(capabilityResult, "not_required");
  assert.equal(passwordAuthEnabledAt, null);
});

test("only successful provider completion records capability and retries one fixed timestamp", async () => {
  const skippedWrites = [];
  for (const outcome of ["provider_failure", "authorization_consumed", "authorization_expired"]) {
    assert.equal(await reconcilePasswordAuthCapabilityAfterRecovery({
      outcome,
      recordCapability: async (enabledAt) => { skippedWrites.push(enabledAt); return true; },
    }), "not_required");
  }
  assert.equal(skippedWrites.length, 0);

  const writes = [];
  assert.equal(await reconcilePasswordAuthCapabilityAfterRecovery({
    outcome: "completed",
    recordCapability: async (enabledAt) => {
      writes.push(enabledAt);
      return writes.length === 3;
    },
    wait: async () => undefined,
  }), "recorded");
  assert.equal(writes.length, 3);
  assert.equal(new Set(writes).size, 1);
  assert.match(writes[0], /^\d{4}-\d{2}-\d{2}T/);
});

test("provider success remains success when Furvise capability reconciliation is still required", async () => {
  assert.equal(await reconcilePasswordAuthCapabilityAfterRecovery({
    outcome: "reconciliation_required",
    recordCapability: async () => false,
    wait: async () => undefined,
  }), "reconciliation_required");

  const route = read("app/api/auth/update-password/route.ts");
  assert.ok(route.indexOf("performRecoveryPasswordUpdate") < route.indexOf("reconcilePasswordAuthCapabilityAfterRecovery"));
  assert.match(route, /result\.outcome === "completed" \|\| result\.outcome === "reconciliation_required"/);
  assert.match(route, /recordPasswordAuthCapability\(userId, enabledAt\)/);
  assert.match(route, /PASSWORD_CAPABILITY_RECONCILIATION_REQUIRED/);
  assert.match(route, /return authJson\(\{ code: "PASSWORD_UPDATED"/);
});

test("migration backfills only a boolean-style credential determination and protects client writes", () => {
  const migration = read("supabase/migrations/20260902094438_password_auth_capability_state.sql");
  assert.match(migration, /add column if not exists password_auth_enabled_at timestamptz/);
  assert.match(migration, /from auth\.users as users[\s\S]*nullif\(users\.encrypted_password, ''\) is not null/);
  assert.doesNotMatch(migration, /select\s+users\.encrypted_password|raw_app_meta_data\s*=|auth\.identities/);
  assert.match(migration, /current_user not in \('postgres', 'service_role'\)/);
  assert.match(migration, /PASSWORD_AUTH_CAPABILITY_SERVER_MANAGED/);
  assert.match(migration, /before insert on public\.user_profiles/);
  assert.match(migration, /before update of password_auth_enabled_at on public\.user_profiles/);
});

test("Security reads the RLS-scoped profile without accepting a user id and avoids a false setup flash", () => {
  const client = read("app/lib/supabase.ts");
  const loader = client.slice(client.indexOf("export async function loadCurrentPasswordAuthCapability"), client.indexOf("export async function updateUserProductCountryForUser"));
  const security = read("app/settings/security/page.tsx");
  assert.match(loader, /\.from\("user_profiles"\)[\s\S]*\.select\("password_auth_enabled_at"\)[\s\S]*\.maybeSingle/);
  assert.doesNotMatch(loader, /userId|user\.id|\.eq\("user_id"/);
  assert.match(security, /hasPasswordAuthCapability\(user, currentCapability\?\.enabledAt\)/);
  assert.match(security, /passwordCapabilityLoading \? "Checking\.\.\."/);
  assert.match(security, /emailPasswordUser \? "Connected" : "Not set up"/);
});

test("hardened current-password changes accept either positive capability signal", () => {
  const route = read("app/api/account/change-password/route.ts");
  assert.match(route, /if \(!hasEmailPasswordProvider\(user\)\)[\s\S]*select\("password_auth_enabled_at"\)[\s\S]*maybeSingle/);
  assert.match(route, /if \(!hasPasswordAuthCapability\(user, passwordAuthEnabledAt\)\)/);
  assert.doesNotMatch(route, /\.eq\("user_id"/);
  for (const protection of ["requireCaptchaToken", "ACCOUNT_PASSWORD_CHANGE", "PASSWORD_REUSED", "performAccountPasswordChange"]) {
    assert.match(route, new RegExp(protection));
  }
});
