import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const challenge = read("app/components/turnstile-challenge.tsx");
const login = read("app/login/page.tsx");

test("a previously loaded Turnstile API renders immediately when the challenge mounts", () => {
  assert.match(challenge, /useEffect\(\(\) => \{\s*if \(!window\.turnstile\) return;[\s\S]*queueMicrotask\(\(\) => \{ if \(mounted\) renderWidget\(\); \}\);[\s\S]*\}, \[renderWidget\]\)/);
});

test("Next Script readiness initializes Turnstile after both cached and initial loads", () => {
  const script = challenge.slice(challenge.indexOf("<Script"), challenge.indexOf("<div ref={elementRef}"));
  assert.match(script, /onLoad=\{renderWidget\}/);
  assert.match(script, /onReady=\{renderWidget\}/);
});

test("widget identity prevents duplicate Turnstile renders and cleanup remains holder-scoped", () => {
  assert.match(challenge, /window\.turnstile \|\| widgetRef\.current\) return/);
  assert.match(challenge, /widgetRef\.current = window\.turnstile\.render/);
  assert.match(challenge, /window\.turnstile\.remove\(widgetRef\.current\)/);
});

test("widget and script failures expose a retryable security-check error", () => {
  assert.match(challenge, /onError=\{\(\) => \{ onTokenRef\.current\(null\); setRenderFailed\(true\); \}\}/);
  assert.match(challenge, /"error-callback": \(\) => \{[\s\S]*onTokenRef\.current\(null\);[\s\S]*setRenderFailed\(true\)/);
  assert.match(challenge, /role="alert"/);
  assert.match(challenge, />Retry security check<\/button>/);
  assert.match(challenge, /onClick=\{retryWidget\}/);
});

test("CAPTCHA_REQUIRED reveals the challenge and blocks sign-in only until it has a token", () => {
  assert.match(login, /payload\?\.code === "CAPTCHA_REQUIRED" && mode === "signin"\) setLoginCaptchaRequired\(true\)/);
  assert.match(login, /mode === "signup" \|\| loginCaptchaRequired \? <TurnstileChallenge/);
  assert.match(login, /const captchaBlocksSubmission = !captchaToken && \(loginCaptchaRequired \|\|/);
  assert.match(login, /disabled=\{!authChecked \|\| loading \|\| Boolean\(configError\) \|\| captchaBlocksSubmission\}/);
  assert.match(challenge, /The security check could not load/);
});
