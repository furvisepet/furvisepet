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
  assert.match(challenge, /queueMicrotask\(\(\) => \{\s*setWidgetReady\(false\);\s*setRenderFailed\(true\);/);
});

test("widget and script failures expose a retryable security-check error", () => {
  assert.match(challenge, /onError=\{\(\) => \{ onTokenRef\.current\(null\); setWidgetReady\(false\); setRenderFailed\(true\); \}\}/);
  assert.match(challenge, /"error-callback": \(\) => \{[\s\S]*onTokenRef\.current\(null\);[\s\S]*setRenderFailed\(true\)/);
  assert.match(challenge, /role="alert"/);
  assert.match(challenge, />Retry security check<\/button>/);
  assert.match(challenge, /onClick=\{retryWidget\}/);
});

test("the challenge keeps loading quiet for sighted users and exposes visible retry feedback", () => {
  assert.match(challenge, /!widgetReady && !renderFailed \? <span aria-live="polite" className="sr-only">Preparing security check\.<\/span>/);
  assert.doesNotMatch(challenge, /Loading security check/);
  assert.match(challenge, /renderFailed \? \([\s\S]*Retry security check/);
  const signIn = login.slice(login.indexOf("function SigninPasswordStep"), login.indexOf("function SignupMethodStep"));
  assert.ok(signIn.indexOf("<TurnstileChallenge") < signIn.indexOf('type="submit"'));
});

test("explicit rendering uses the supported interaction-only appearance without hiding provider UI", () => {
  assert.match(challenge, /appearance: "interaction-only"/);
  assert.match(challenge, /<div ref=\{elementRef\} \/>/);
  assert.doesNotMatch(challenge, /display:\s*none|visibility:\s*hidden|opacity:\s*0|clip-path|overflow-hidden|hidden[^A-Za-z]/i);
});

test("Turnstile is lazy-mounted only after a protected Auth submit intent", () => {
  const method = login.slice(login.indexOf("function SignupMethodStep"), login.indexOf("function SignupPasswordStep"));
  const password = login.slice(login.indexOf("function SignupPasswordStep"), login.indexOf("function SignupVerificationStep"));
  const request = login.slice(login.indexOf("function requestAuthSubmission"), login.indexOf("function handleAuthChallengeToken"));
  assert.doesNotMatch(method, /TurnstileChallenge|PasswordInput/);
  assert.match(password, /authChallengeVisible \? <TurnstileChallenge onToken=\{handleAuthChallengeToken\} resetSignal=\{captchaReset\} \/> : null/);
  assert.match(request, /setAuthChallengeVisible\(true\)/);
  assert.match(request, /authSubmitPendingRef\.current = true/);
  assert.doesNotMatch(request, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.doesNotMatch(login, /loginCaptchaRequired|setLoginCaptchaRequired/);
  assert.doesNotMatch(login, /captchaBlocksSubmission/);
  assert.match(challenge, /Local security-check test mode\./);
  assert.match(challenge, /The security check could not load/);
});

test("Turnstile success resumes one pending action while failure and expiry stay fail-closed", () => {
  const successCallback = challenge.slice(challenge.indexOf("callback: (token: string)"), challenge.indexOf('"error-callback"'));
  assert.match(successCallback, /onTokenRef\.current\(token\)/);
  assert.doesNotMatch(successCallback, /submit|requestSubmit|fetch/);
  const handler = login.slice(login.indexOf("function handleAuthChallengeToken"), login.indexOf("async function submitAuth"));
  assert.match(handler, /if \(!token \|\| !authSubmitPendingRef\.current\) return/);
  assert.match(handler, /authSubmitPendingRef\.current = false/);
  assert.equal((handler.match(/submitAuth\(token\)/g) || []).length, 1);
  assert.doesNotMatch(login, /requestSubmit/);
});
