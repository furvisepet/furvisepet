import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { finalizeTemporaryRecoverySession } from "../app/lib/security/auth-abuse/recovery-session-cleanup.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("verified recovery stays in the dedicated recovery interface", () => {
  const callback = read("app/auth/callback/route.ts");
  const chrome = read("app/lib/navigation/mobile-navigation.ts");
  const update = read("app/update-password/page.tsx");
  const confirmation = read("app/reset-password/confirm/page.tsx");

  assert.match(callback, /new URL\("\/update-password", request\.nextUrl\.origin\)/);
  assert.equal((callback.match(/new URL\("\/update-password"/g) || []).length, 1);
  assert.doesNotMatch(`${update}\n${confirmation}`, /<SignedInHeader|<AuthenticatedAppChrome|href="\/(?:dashboard|today|account|settings)/);
  assert.doesNotMatch(chrome, /"\/update-password"|"\/reset-password\/confirm"/);
});

test("provider success consumes recovery state, signs out globally, and replaces history with login", () => {
  const route = read("app/api/auth/update-password/route.ts");
  const page = read("app/update-password/page.tsx");

  assert.ok(route.indexOf("consumeRecoveryAuthorization") < route.indexOf("closeTemporaryRecoverySession(supabase)"));
  assert.match(route, /signOut\(\{ scope: "global" \}\)/);
  assert.match(route, /clearRecoveryAuthorizationCookie/);
  assert.match(route, /RECOVERY_HANDOFF_COOKIE/);
  assert.match(route, /sb-\$\{projectRef\}-auth-token/);
  assert.match(page, /signOut\(\{ scope: "local" \}\)/);
  assert.match(page, /setBrowserSupabasePersistence\(null\)/);
  assert.match(page, /const PASSWORD_RESET_SUCCESS_PATH = "\/login\?passwordReset=success"/);
  assert.match(page, /window\.location\.replace\(PASSWORD_RESET_SUCCESS_PATH\)/);
  assert.doesNotMatch(page, /href="\/(?:dashboard|today)"|Go to Today/);
  assert.match(page, /href="\/forgot-password">Request a new reset link/);
});

test("cleanup failures still run local cleanup and end at the fixed login destination", async () => {
  const calls = [];
  const result = await finalizeTemporaryRecoverySession({
    clearLocalState: async () => { calls.push("clear"); },
    signOutGlobally: async () => { calls.push("signout"); throw new Error("provider unavailable"); },
  });

  assert.deepEqual(calls, ["signout", "clear"]);
  assert.deepEqual(result, { localStateCleared: true, providerSignedOut: false });
  assert.match(read("app/update-password/page.tsx"), /window\.location\.replace\(PASSWORD_RESET_SUCCESS_PATH\)/);
});

test("login recognizes only the fixed password-reset success state", () => {
  const login = read("app/login/page.tsx");
  assert.match(login, /getAll\("passwordReset"\)/);
  assert.match(login, /passwordResetValues\.length === 1 && passwordResetValues\[0\] === "success"/);
  assert.match(login, /Your password has been updated\. Sign in with your new password\./);
  assert.doesNotMatch(login, /searchParams\.get\("(?:message|successMessage)"\)/);
});

test("recovery completion cannot fall into application routing or authorize account password change", () => {
  const route = read("app/api/auth/update-password/route.ts");
  const callback = read("app/auth/callback/route.ts");
  const accountRoute = read("app/api/account/change-password/route.ts");
  const securityPage = read("app/settings/security/page.tsx");

  assert.doesNotMatch(route, /new URL\("\/"|\/dashboard|\/today|resolvePostGoogleAuthDestination/);
  assert.match(callback, /resolvePostGoogleAuthDestination/);
  assert.doesNotMatch(accountRoute, /RECOVERY_AUTH_COOKIE|readRecoveryAuthorizationCookie|issueRecoveryAuthorization/);
  assert.doesNotMatch(securityPage, /\/api\/auth\/update-password|\/update-password/);
  assert.match(accountRoute, /\/api\/account\/change-password/);
});

test("recovery and completed private responses remain no-store", () => {
  const proxy = read("app/lib/supabase/proxy.ts");
  const route = read("app/api/auth/update-password/route.ts");
  const privateRoutes = read("app/lib/security/private-routes.ts");

  assert.match(proxy, /request\.nextUrl\.pathname === "\/update-password"/);
  assert.match(proxy, /request\.nextUrl\.pathname === "\/reset-password\/confirm"/);
  assert.match(route, /authJson\(/);
  assert.match(privateRoutes, /no-store/);
});

test("recovery completion adds no credential-bearing diagnostics", () => {
  const route = read("app/api/auth/update-password/route.ts");
  const diagnostic = route.slice(route.indexOf("function emitResult"));
  assert.doesNotMatch(route, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(diagnostic, /sessionToken|marker|cookie|authorization|email|rawIp|password\s*:/i);
});
