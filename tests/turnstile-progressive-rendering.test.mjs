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
  assert.match(challenge, /try \{ window\.turnstile\.remove\(widgetRef\.current\); \} catch/);
  assert.match(challenge, /try \{\s*window\.turnstile\.reset\(widgetRef\.current\);\s*\} catch \{/);
  assert.match(challenge, /queueMicrotask\(\(\) => \{\s*setWidgetVisible\(false\);\s*setRenderFailed\(true\);/);
});

test("widget and script failures expose a retryable security-check error", () => {
  assert.match(challenge, /onError=\{\(\) => \{ onTokenRef\.current\(null\); setWidgetVisible\(false\); setRenderFailed\(true\); \}\}/);
  assert.match(challenge, /"error-callback": \(\) => \{[\s\S]*onTokenRef\.current\(null\);[\s\S]*setRenderFailed\(true\)/);
  assert.match(challenge, /role="alert"/);
  assert.match(challenge, />Retry security check<\/button>/);
  assert.match(challenge, /onClick=\{retryWidget\}/);
});

test("the challenge has visible loading or retry feedback whenever authentication is blocked", () => {
  assert.match(challenge, /!widgetVisible && !renderFailed \? <p aria-live="polite"[\s\S]*Loading security check/);
  assert.match(challenge, /renderFailed \? \([\s\S]*Retry security check/);
  const signIn = login.slice(login.indexOf("function SigninForm"), login.indexOf("function SignupMethodStep"));
  assert.ok(signIn.indexOf("<TurnstileChallenge") < signIn.indexOf('type="submit"'));
});

test("Turnstile is deferred until the signup password step while production Auth waits for a token", () => {
  const method = login.slice(login.indexOf("function SignupMethodStep"), login.indexOf("function SignupPasswordStep"));
  const password = login.slice(login.indexOf("function SignupPasswordStep"), login.indexOf("function SignupVerificationStep"));
  assert.doesNotMatch(method, /TurnstileChallenge|PasswordInput/);
  assert.match(password, /<TurnstileChallenge onToken=\{setCaptchaToken\} resetSignal=\{captchaReset\} \/>/);
  assert.match(login, /<TurnstileChallenge onToken=\{setCaptchaToken\} resetSignal=\{captchaReset\} \/>/);
  assert.doesNotMatch(login, /loginCaptchaRequired|setLoginCaptchaRequired/);
  assert.match(login, /const captchaBlocksSubmission = process\.env\.NODE_ENV === "production" && !captchaToken;/);
  assert.match(login, /disabled=\{!authChecked \|\| loading \|\| Boolean\(configError\) \|\| captchaBlocksSubmission\}/);
  assert.match(challenge, /Local security-check test mode\./);
  assert.match(challenge, /The security check could not load/);
});

test("Turnstile success only stores the token and never submits the form automatically", () => {
  const successCallback = challenge.slice(challenge.indexOf("callback: (token: string)"), challenge.indexOf('"error-callback"'));
  assert.match(successCallback, /onTokenRef\.current\(token\)/);
  assert.doesNotMatch(successCallback, /submit|requestSubmit|fetch/);
  assert.doesNotMatch(login, /useEffect\([^)]*captchaToken[\s\S]*submitAuth|requestSubmit/);
});
