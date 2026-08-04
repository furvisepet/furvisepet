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
  assert.match(recovery, /captchaToken: token \|\| undefined/);
  assert.match(recovery, /process\.env\.NODE_ENV === "production" && !captchaToken/);
});

test("update-password routes recovery codes through the server assurance callback", () => {
  const page = read("app/update-password/page.tsx");

  assert.match(page, /window\.location\.replace\(`\/auth\/callback\?flow=recovery&code=/);
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

  assert.match(homepage, /showSignIn=\{mode === "anonymous"\}/);
  assert.match(homepage, /mode === "no-pets"[\s\S]*Add your pet/);
  assert.match(homepage, /mode === "with-pet"[\s\S]*Ask about \{petName\}/);
  assert.match(header, /resolvedAuthState === "authenticated" \? APP_NAV_ITEMS/);
  assert.match(header, /aria-label="Furvise home"/);
});

test("Products results keep a compact count and avoid comparison UI", () => {
  const page = read("app/shop/page.tsx");
  const results = page.slice(page.indexOf("function ShopResults"), page.indexOf("function ProductCard"));

  assert.match(results, /formatProductResultCount\(products\.length\)/);
  assert.match(results, /products\.map\(\(product\) => \(/);
  assert.match(results, /<ProductCard/);
  assert.doesNotMatch(results, /Compare these products|ProductComparisonPanel|product-comparison/i);
});
