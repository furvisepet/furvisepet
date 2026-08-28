import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { executeTurnstileOnce } from "../app/lib/turnstile-explicit-execution.ts";

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
  assert.match(challenge, /previousResetSignalRef\.current === resetSignal/);
  assert.match(challenge, /queueMicrotask\(\(\) => \{\s*setWidgetReady\(false\);\s*setRenderFailed\(true\);/);
});

test("explicit execution waits for widget readiness and executes each requested action once", () => {
  const executions = [];
  const api = { execute: (widgetId) => executions.push(widgetId) };
  const state = { lastSignal: null };
  assert.equal(executeTurnstileOnce({ api: undefined, signal: 1, state, widgetId: null }), false);
  assert.equal(executeTurnstileOnce({ api, signal: 1, state, widgetId: "widget-one" }), true);
  assert.equal(executeTurnstileOnce({ api, signal: 1, state, widgetId: "widget-one" }), false);
  assert.deepEqual(executions, ["widget-one"]);
  assert.equal(executeTurnstileOnce({ api, signal: 2, state, widgetId: "widget-one" }), true);
  assert.deepEqual(executions, ["widget-one", "widget-one"]);
});

test("widget and script failures expose a retryable security-check error", () => {
  assert.match(challenge, /onError=\{\(\) => \{ setWidgetReady\(false\); setRenderFailed\(true\); failChallenge\(\); \}\}/);
  assert.match(challenge, /"error-callback": \(\) => \{[\s\S]*setRenderFailed\(true\);[\s\S]*failChallenge\(\)/);
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

test("account routing alone opts into explicit execution while shared challenge behavior stays automatic", () => {
  assert.match(challenge, /execute\(widgetId: string\): void/);
  assert.match(challenge, /execution === "execute" \? \{ execution: "execute" \} : \{\}/);
  assert.match(challenge, /executeTurnstileOnce/);
  assert.match(challenge, /"timeout-callback": failChallenge/);
  assert.match(challenge, /"unsupported-callback": failChallenge/);
  assert.match(login, /action="account_route"[\s\S]*executeSignal=\{accountRouteExecuteSignal\}[\s\S]*execution="execute"/);
  assert.equal((login.match(/execution="execute"/g) || []).length, 1);
});

test("Turnstile is lazy-mounted only after a protected Auth submit intent", () => {
  const method = login.slice(login.indexOf("function SignupMethodStep"), login.indexOf("function SignupPasswordStep"));
  const password = login.slice(login.indexOf("function SignupPasswordStep"), login.indexOf("function SignupOtpStep"));
  const accountRouteIntent = login.slice(login.indexOf("function continueSignupWithEmail"), login.indexOf("function handleAccountRouteChallengeToken"));
  const accountRouteToken = login.slice(login.indexOf("function handleAccountRouteChallengeToken"), login.indexOf("async function routeSignupEmail"));
  const request = login.slice(login.indexOf("function requestAuthSubmission"), login.indexOf("function handleAuthChallengeToken"));
  assert.doesNotMatch(method, /PasswordInput/);
  assert.match(method, /accountRouteChallengeVisible \? \([\s\S]*<TurnstileChallenge[\s\S]*action="account_route"/);
  assert.match(accountRouteIntent, /accountRoutePendingRef\.current = true/);
  assert.match(accountRouteIntent, /setAccountRouteChallengeVisible\(true\)/);
  assert.match(accountRouteIntent, /setAccountRouteExecuteSignal\(accountRouteExecuteSequenceRef\.current\)/);
  assert.match(accountRouteIntent, /window\.setTimeout\(failAccountRouteSecurityCheck, ACCOUNT_ROUTE_WATCHDOG_MS\)/);
  assert.doesNotMatch(accountRouteIntent, /setCaptchaReset/);
  assert.doesNotMatch(accountRouteIntent, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.match(accountRouteToken, /if \(!accountRoutePendingRef\.current\) return/);
  assert.match(accountRouteToken, /accountRoutePendingRef\.current = false/);
  assert.equal((accountRouteToken.match(/routeSignupEmail\(token\)/g) || []).length, 1);
  assert.match(password, /authChallengeVisible \? <TurnstileChallenge onToken=\{handleAuthChallengeToken\} resetSignal=\{captchaReset\} \/> : null/);
  assert.match(request, /setAuthChallengeVisible\(true\)/);
  assert.match(request, /authSubmitPendingRef\.current = true/);
  assert.doesNotMatch(request, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.doesNotMatch(login, /loginCaptchaRequired|setLoginCaptchaRequired/);
  assert.doesNotMatch(login, /captchaBlocksSubmission/);
  assert.match(challenge, /Local security-check test mode\./);
  assert.match(challenge, /The security check could not load/);
});

test("account-route challenge failures and the watchdog restore a retryable Continue state", () => {
  const failure = login.slice(login.indexOf("function failAccountRouteSecurityCheck"), login.indexOf("function continueSignupWithEmail"));
  assert.match(failure, /accountRoutePendingRef\.current = false/);
  assert.match(failure, /setAccountRoutePending\(false\)/);
  assert.match(failure, /setAccountRouteExecuteSignal\(null\)/);
  assert.match(failure, /setLoading\(false\)/);
  assert.match(failure, /setError\("Security check failed\. Try again\."\)/);
  assert.match(challenge, /onError=\{\(\) => \{ setWidgetReady\(false\); setRenderFailed\(true\); failChallenge\(\); \}\}/);
});

test("Turnstile success resumes one pending action while failure and expiry stay fail-closed", () => {
  const successCallback = challenge.slice(challenge.indexOf("callback: (token: string)"), challenge.indexOf('"error-callback"'));
  assert.match(successCallback, /onTokenRef\.current\(token\)/);
  assert.doesNotMatch(successCallback, /submit|requestSubmit|fetch/);
  const handler = login.slice(login.indexOf("function handleAuthChallengeToken"), login.indexOf("async function submitAuth"));
  assert.match(handler, /authCaptchaTokenRef\.current = token/);
  assert.match(handler, /if \(!token\) \{[\s\S]*authSubmitPendingRef\.current = false;[\s\S]*setAuthSubmitPending\(false\)/);
  assert.match(handler, /if \(!authSubmitPendingRef\.current\) return/);
  assert.match(handler, /authSubmitPendingRef\.current = false/);
  assert.match(handler, /authCaptchaTokenRef\.current = null/);
  assert.match(handler, /setAuthSubmitPending\(false\)/);
  assert.equal((handler.match(/submitAuth\(token\)/g) || []).length, 1);
  assert.doesNotMatch(login, /requestSubmit/);
});
