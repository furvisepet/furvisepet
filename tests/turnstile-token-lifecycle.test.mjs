import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const requestAuth = login.slice(login.indexOf("function requestAuthSubmission"), login.indexOf("function handleAuthChallengeToken"));
const handleAuthToken = login.slice(login.indexOf("function handleAuthChallengeToken"), login.indexOf("async function submitAuth"));
const submitAuth = login.slice(login.indexOf("async function submitAuth"), login.indexOf("async function startGoogle"));
const requestResend = login.slice(login.indexOf("function requestResendConfirmation"), login.indexOf("function handleResendChallengeToken"));
const handleResendToken = login.slice(login.indexOf("function handleResendChallengeToken"), login.indexOf("async function resendConfirmation"));
const resendConfirmation = login.slice(login.indexOf("async function resendConfirmation"), login.indexOf('if (authStatus === "signedIn")'));

test("the first login request waits for and serializes the exact successful CAPTCHA token", () => {
  const request = submitAuth.indexOf("await idempotentClientFetch(endpoint");
  const reset = submitAuth.indexOf("resetCaptchaAfterRequest();");

  assert.match(requestAuth, /authSubmitPendingRef\.current = true/);
  assert.match(requestAuth, /setAuthChallengeVisible\(true\)/);
  assert.doesNotMatch(requestAuth, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.match(handleAuthToken, /if \(!token \|\| !authSubmitPendingRef\.current\) return/);
  assert.match(handleAuthToken, /authSubmitPendingRef\.current = false/);
  assert.equal((handleAuthToken.match(/submitAuth\(token\)/g) || []).length, 1);
  assert.match(submitAuth, /async function submitAuth\(token: string\) \{\s*if \(!token\) return/);
  assert.ok(request >= 0);
  assert.ok(reset > request);
  assert.match(submitAuth, /body: JSON\.stringify\(\{[^}]*captchaToken: token[^}]*\}\)/);
  assert.match(submitAuth, /await idempotentClientFetch\(endpoint, init,/);
  assert.match(submitAuth, /await fetch\(endpoint, init\)/);
  assert.doesNotMatch(submitAuth.slice(0, submitAuth.indexOf("try {")), /setCaptchaToken\(null\)|setCaptchaReset|resetCaptchaAfterRequest/);
});

test("a failed Auth request clears the spent token and resets the widget only after the response", () => {
  const failedResponse = submitAuth.slice(submitAuth.indexOf("if (!result.ok)"), submitAuth.indexOf('if (mode === "signin") {'));

  assert.match(failedResponse, /resetCaptchaAfterRequest\(\);/);
  assert.ok(submitAuth.indexOf("resetCaptchaAfterRequest();", submitAuth.indexOf("if (!result.ok)")) > submitAuth.indexOf("await idempotentClientFetch(endpoint"));
  assert.match(login, /function resetCaptchaAfterRequest\(\) \{\s*setCaptchaToken\(null\);\s*setCaptchaReset\(\(value\) => value \+ 1\);\s*\}/);
});

test("successful login navigates without resetting the accepted token first", () => {
  const successfulLogin = submitAuth.slice(submitAuth.indexOf('if (mode === "signin") {'), submitAuth.indexOf("resetCaptchaAfterRequest();", submitAuth.indexOf('if (mode === "signin") {')));

  assert.match(successfulLogin, /didRedirectRef\.current = true;/);
  assert.match(successfulLogin, /router\.replace\(nextPath\);/);
  assert.match(successfulLogin, /return;/);
  assert.doesNotMatch(successfulLogin, /resetCaptchaAfterRequest|setCaptchaToken|null\)/);
});

test("signup and confirmation resend reset Turnstile only after their requests settle", () => {
  const signupRequest = submitAuth.indexOf("await idempotentClientFetch(endpoint");
  const signupReset = submitAuth.indexOf("resetCaptchaAfterRequest();", signupRequest);
  const resendRequest = resendConfirmation.indexOf('await idempotentClientFetch("/api/auth/resend"');
  const resendReset = resendConfirmation.indexOf("resetCaptchaAfterRequest();", resendRequest);

  assert.ok(signupRequest >= 0 && signupReset > signupRequest);
  assert.doesNotMatch(submitAuth.slice(0, signupRequest), /resetCaptchaAfterRequest|setCaptchaToken\(null\)|setCaptchaReset/);
  assert.match(requestResend, /resendSubmitPendingRef\.current = true/);
  assert.doesNotMatch(requestResend, /idempotentClientFetch|\/api\/auth\/resend/);
  assert.match(handleResendToken, /if \(!token \|\| !resendSubmitPendingRef\.current\) return/);
  assert.equal((handleResendToken.match(/resendConfirmation\(token\)/g) || []).length, 1);
  assert.ok(resendRequest >= 0 && resendReset > resendRequest);
  assert.doesNotMatch(resendConfirmation.slice(0, resendRequest), /resetCaptchaAfterRequest|setCaptchaToken\(null\)|setCaptchaReset/);
  assert.match(resendConfirmation, /body: JSON\.stringify\(\{[^}]*captchaToken: token[^}]*\}\)/);
});
