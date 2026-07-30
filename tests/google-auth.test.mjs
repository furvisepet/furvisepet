import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildOAuthCallbackUrl,
  isGoogleAuthEnabled,
  resolvePostGoogleAuthDestination,
} from "../app/lib/auth-identity.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Google rendering is controlled only by the public feature flag", () => {
  assert.equal(isGoogleAuthEnabled("true"), true);
  assert.equal(isGoogleAuthEnabled("false"), false);
  assert.equal(isGoogleAuthEnabled(undefined), false);
  const login = read("app/login/page.tsx");
  assert.match(login, /GOOGLE_AUTH_ENABLED \? <>/);
  assert.match(login, /Continue with Google/);
  assert.doesNotMatch(login, /Apple|Social sign-in will be available/);
});

test("Google OAuth uses the rate-limited server initiation route and validated callback", () => {
  const client = read("app/lib/google-auth-client.ts");
  const route = read("app/api/auth/oauth/route.ts");
  assert.match(client, /fetch\("\/api\/auth\/oauth"/);
  assert.match(client, /window\.location\.assign\(payload\.redirectTo\)/);
  assert.match(route, /provider: "google"/);
  assert.match(route, /signInWithOAuth/);
  assert.match(route, /buildOAuthCallbackUrl\(new URL\(request\.url\)\.origin, next\)/);
  assert.equal(buildOAuthCallbackUrl("https://furvise.test", "/shop?pet=luna"), "https://furvise.test/auth/callback?next=%2Fshop%3Fpet%3Dluna");
  assert.equal(buildOAuthCallbackUrl("https://furvise.test", "https://evil.test/path"), "https://furvise.test/auth/callback?next=%2Ftoday");
  assert.equal(buildOAuthCallbackUrl("https://furvise.test", "//evil.test/path"), "https://furvise.test/auth/callback?next=%2Ftoday");
});

test("Google initiation is click-idempotent and reports friendly failure", () => {
  const login = read("app/login/page.tsx");
  assert.match(login, /if \(googleStartingRef\.current\) return/);
  assert.match(login, /disabled=\{googleLoading\}/);
  assert.match(login, /Google sign-in couldn’t start\. Please try again\./);
  assert.doesNotMatch(login, /oauthError\.message|Supabase.*error/);
});

test("callback exchanges one code and reuses a UUID-keyed application profile", () => {
  const callback = read("app/auth/callback/route.ts");
  const identity = read("app/lib/auth-identity.ts");
  const profileMigration = read("supabase/migrations/20260718000000_ensure_user_profiles_schema.sql");
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /supabase\.auth\.getUser\(\)/);
  assert.match(callback, /ensureCanonicalApplicationUser/);
  assert.match(identity, /upsert\(\{ user_id: user\.id \}, \{ ignoreDuplicates: true, onConflict: "user_id" \}\)/);
  assert.match(identity, /from\("dog_profiles"\)[\s\S]*eq\("user_id", user\.id\)/);
  assert.match(profileMigration, /user_id uuid primary key references auth\.users\(id\)/);
});

test("post-auth routing sends petless users to onboarding and pet owners to safe destinations", () => {
  assert.equal(resolvePostGoogleAuthDestination(false, "/shop"), "/onboarding");
  assert.equal(resolvePostGoogleAuthDestination(true, null), "/today");
  assert.equal(resolvePostGoogleAuthDestination(true, "/shop?pet=luna"), "/shop?pet=luna");
  assert.equal(resolvePostGoogleAuthDestination(true, "https://evil.test"), "/today");
  assert.equal(resolvePostGoogleAuthDestination(true, "javascript:alert(1)"), "/today");
});

test("OAuth cancellation returns safely and email authentication remains available", () => {
  const callback = read("app/auth/callback/route.ts");
  const login = read("app/login/page.tsx");
  assert.match(callback, /new URL\("\/login\?error=google_auth_failed", request\.nextUrl\.origin\)/);
  assert.match(login, /"\/api\/auth\/login"/);
  assert.match(login, /"\/api\/auth\/signup"/);
  assert.match(login, /Check your email to continue\. If you already have an account, sign in or reset your password\./);
  assert.match(login, /showConfirmationRecovery \? <button[\s\S]*Resend confirmation email/);
});

test("auth card remains compact, responsive, and keyboard visible", () => {
  const layout = read("app/components/account-access.tsx");
  const login = read("app/login/page.tsx");
  assert.match(layout, /max-w-\[480px\]/);
  assert.match(layout, /w-full/);
  assert.match(login, /min-h-12 w-full/);
  assert.match(login, /focus-visible:ring-2/);
  assert.doesNotMatch(login, /min-w-\[|w-\[5\d\dpx\]/);
});
