import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the document is permanently warm-light without preference or hydration dependencies", () => {
  const layout = read("app/layout.tsx");
  const css = read("app/globals.css");

  assert.match(layout, /data-color-scheme="light"/);
  assert.match(layout, /meta name="color-scheme" content="light"/);
  assert.match(css, /:root \{[\s\S]*color-scheme: light/);
  assert.doesNotMatch(layout, /cookies|localStorage|AppearanceProvider|ThemeBootstrap|suppressHydrationWarning|data-theme/i);
  assert.doesNotMatch(css, /data-theme|prefers-color-scheme/i);
});
test("forgot-password keeps the reset request and safe return flow", () => {
  const page = read("app/forgot-password/page.tsx");

  assert.match(page, /idempotentClientFetch\("\/api\/auth\/recovery"/);
  assert.match(page, /TurnstileChallenge/);
  assert.match(page, /type="email"/);
  assert.match(page, /required/);
  assert.match(page, /Send reset link/);
  assert.match(page, /href="\/login"/);
});

test("signup and recovery keep their existing CAPTCHA submission behavior", () => {
  const login = read("app/login/page.tsx");
  const recovery = read("app/forgot-password/page.tsx");

  assert.match(login, /mode === "signin" \? "\/api\/auth\/login" : "\/api\/auth\/signup"/);
  assert.match(login, /idempotentClientFetch\(endpoint, init, `auth-signup:/);
  assert.match(recovery, /challengeVisible \? <TurnstileChallenge onToken=\{handleChallengeToken\}/);
  assert.match(recovery, /if \(!token \|\| !submitPendingRef\.current\) return/);
  assert.match(recovery, /if \(!token\) return/);
  assert.match(recovery, /captchaToken: token/);
  assert.doesNotMatch(recovery.slice(recovery.indexOf("function requestReset"), recovery.indexOf("function handleChallengeToken")), /idempotentClientFetch|\/api\/auth\/recovery/);
});

test("update-password accepts only the already-established recovery session", () => {
  const page = read("app/update-password/page.tsx");

  assert.doesNotMatch(page, /searchParams\.get\("code"\)|location\.hash/);
  assert.match(page, /window\.location\.replace\(PASSWORD_RESET_SUCCESS_PATH\)/);
  assert.doesNotMatch(page, /exchangeCodeForSession\(code\)|authClient\.auth\.setSession/);
  assert.match(page, /getSession\(\)/);
  assert.match(page, /Passwords do not match\./);
  assert.match(page, /fetch\("\/api\/auth\/update-password"/);
  assert.match(page, /"Idempotency-Key": idempotencyKey\.current/);
  assert.match(page, /disabled=\{loading \|\| saving \|\| Boolean\(configError\) \|\| !sessionReady\}/);
});

test("homepage navigation follows the resolved authentication state", () => {
  const header = read("app/components/app-header.tsx");
  const homepage = read("app/components/homepage-client.tsx");

  assert.match(homepage, /showSignIn=\{visibleMode === "anonymous"\}/);
  assert.match(homepage, /mode === "no-pets"[\s\S]*Add your pet/);
  assert.match(homepage, /mode === "with-pet"[\s\S]*Ask about \{petName\}/);
  assert.match(header, /resolvedAuthState === "authenticated" \? APP_NAV_ITEMS/);
  assert.match(header, /aria-label="Furvise home"/);
});
