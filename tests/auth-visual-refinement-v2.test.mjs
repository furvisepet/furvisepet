import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const forgot = read("app/forgot-password/page.tsx");
const layout = read("app/components/account-access.tsx");
const turnstile = read("app/components/turnstile-challenge.tsx");
const googleAsset = read("public/icons/google-g.svg");

const slice = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const signinMethod = slice(login, "function SigninMethodStep", "function SigninPasswordStep");
const signinPassword = slice(login, "function SigninPasswordStep", "function SignupMethodStep");
const signupMethod = slice(login, "function SignupMethodStep", "function SignupPasswordStep");
const signupPassword = slice(login, "function SignupPasswordStep", "function SignupVerificationStep");
const signupVerify = slice(login, "function SignupVerificationStep", "function EmailInput");
const requestAuth = slice(login, "function requestAuthSubmission", "function handleAuthChallengeToken");
const handleAuthToken = slice(login, "function handleAuthChallengeToken", "async function submitAuth");
const submitAuth = slice(login, "async function submitAuth", "async function startGoogle");
const requestResend = slice(login, "function requestResendConfirmation", "function handleResendChallengeToken");
const handleResendToken = slice(login, "function handleResendChallengeToken", "async function resendConfirmation");
const resend = slice(login, "async function resendConfirmation", 'if (authStatus === "signedIn"');
const googleButton = slice(login, "function GoogleButton", "function AuthDivider");
const googleIcon = login.slice(login.indexOf("function GoogleIcon"));

test("method composition centers only its brand and introduction while preserving labeled forms", () => {
  assert.match(login, /centeredIntro=\{initialMethodStep\}/);
  assert.match(layout, /data-ui="account-access-intro"/);
  assert.match(layout, /className=\{centeredIntro \? "text-center" : undefined\}/);
  assert.match(layout, /mb-5 flex justify-center[\s\S]*<BrandMark priority showName=\{false\} size=\{30\} \/>/);
  for (const method of [signinMethod, signupMethod]) {
    assert.match(method, /<form className="grid gap-4"/);
    assert.match(method, /<EmailInput/);
  }
  assert.match(login, /<AccountField label="Email" name="email">/);
  assert.match(login, /<AccountField label="Password" name="password">/);
});

test("reviewed auth copy and task headings are exact", () => {
  for (const copy of [
    "Welcome back",
    "Sign in to pick up where you left off.",
    "Create your account",
    "Add your pet to get started.",
    "Enter your password",
    "Secure your account",
    "Check your email",
  ]) assert.match(login, new RegExp(copy.replace(/[.?]/g, "\\$&")));
  assert.doesNotMatch(login, /Sign in to continue caring for your pets|Start with your pet\. We’ll help with the rest/);
});

test("Google remains a 56px accessible icon button with the multicolor mark", () => {
  assert.match(googleButton, /aria-label="Continue with Google"/);
  assert.match(googleButton, /title="Continue with Google"/);
  assert.match(googleButton, /size-14/);
  assert.match(googleButton, /border-\[var\(--line\)\]/);
  assert.doesNotMatch(googleButton, /border-\[var\(--forest\)|border-\[var\(--deep-forest\)/);
  assert.match(googleIcon, /<Image alt="" height=\{20\} src="\/icons\/google-g\.svg" width=\{20\} \/>/);
  for (const color of ["#4285F4", "#34A853", "#FBBC05", "#EA4335"]) assert.match(googleAsset, new RegExp(`fill="${color}"`));
  assert.doesNotMatch(googleIcon, /currentColor/);
});

test("password steps use safe corner navigation without redundant email links or repeated branding", () => {
  assert.match(login, /backLabel="Back to email"/);
  assert.match(login, /onBack=\{passwordStep \? returnToEmail : undefined\}/);
  assert.match(login, /showBrand=\{initialMethodStep\}/);
  assert.match(login, /showClose/);
  assert.match(layout, /aria-label=\{backLabel\}/);
  assert.match(layout, /aria-label="Close and return to Furvise home"/);
  assert.match(layout, /accountCornerControlClass =[\s\S]*min-h-11 min-w-11/);
  assert.doesNotMatch(`${signinPassword}\n${signupPassword}`, /Change email|BrandMark/);
  assert.doesNotMatch(signupVerify, /onBack|BrandMark/);
  assert.match(signupVerify, /Use a different email/);
});

test("Auth challenge mounts on submit and one valid token resumes exactly one guarded request", () => {
  for (const password of [signinPassword, signupPassword]) {
    assert.match(password, /authChallengeVisible \? <TurnstileChallenge/);
    assert.match(password, /onSubmit=\{requestAuthSubmission\}/);
  }
  assert.match(requestAuth, /authSubmitPendingRef\.current = true/);
  assert.match(requestAuth, /setAuthChallengeVisible\(true\)/);
  assert.doesNotMatch(requestAuth, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.match(handleAuthToken, /if \(!token \|\| !authSubmitPendingRef\.current\) return/);
  assert.match(handleAuthToken, /authSubmitPendingRef\.current = false/);
  assert.equal((handleAuthToken.match(/submitAuth\(token\)/g) || []).length, 1);
  assert.match(submitAuth, /if \(!token\) return/);
  assert.match(submitAuth, /captchaToken: token/);
  assert.match(submitAuth, /await fetch\(endpoint, init\)/);
  assert.match(submitAuth, /idempotentClientFetch\(endpoint, init, `auth-signup:\$\{normalizedEmail\}`\)/);
});

test("recovery and resend defer their APIs until a pending action receives a token", () => {
  const requestReset = slice(forgot, "function requestReset", "function handleChallengeToken");
  const handleResetToken = slice(forgot, "function handleChallengeToken", "async function submitReset");
  const submitReset = slice(forgot, "async function submitReset", "return (");
  assert.match(forgot, /challengeVisible \? <TurnstileChallenge/);
  assert.doesNotMatch(requestReset, /idempotentClientFetch|\/api\/auth\/recovery/);
  assert.match(handleResetToken, /if \(!token \|\| !submitPendingRef\.current\) return/);
  assert.equal((handleResetToken.match(/submitReset\(token\)/g) || []).length, 1);
  assert.match(submitReset, /if \(!token\) return/);
  assert.match(submitReset, /captchaToken: token/);
  assert.match(requestResend, /setResendChallengeVisible\(true\)/);
  assert.doesNotMatch(requestResend, /idempotentClientFetch|\/api\/auth\/resend/);
  assert.match(handleResendToken, /if \(!token \|\| !resendSubmitPendingRef\.current\) return/);
  assert.equal((handleResendToken.match(/resendConfirmation\(token\)/g) || []).length, 1);
  assert.match(resend, /if \(!normalizedEmail \|\| !token/);
  assert.match(resend, /idempotentClientFetch\("\/api\/auth\/resend"/);
  assert.match(login, /const SIGNUP_RESEND_COOLDOWN_SECONDS = 60/);
});

test("provider recovery stays visible and the inset mobile sheet remains safe", () => {
  assert.match(turnstile, /appearance: "interaction-only"/);
  assert.match(turnstile, /"error-callback": \(\) => \{[\s\S]*onTokenRef\.current\(null\)/);
  assert.match(turnstile, /"expired-callback": \(\) => onTokenRef\.current\(null\)/);
  assert.match(turnstile, /onClick=\{retryWidget\}/);
  assert.match(turnstile, />Retry security check<\/button>/);
  assert.doesNotMatch(turnstile, /display:\s*none|visibility:\s*hidden|clip-path|overflow-hidden/i);
  assert.match(layout, /py-3/);
  assert.match(layout, /min-h-\[calc\(100svh-1\.5rem\)\]/);
  assert.match(layout, /rounded-\[1\.75rem\]/);
  assert.match(layout, /overflow-x-hidden/);
  assert.match(layout, /safe-area-inset-top/);
  assert.match(layout, /safe-area-inset-bottom/);
  assert.match(layout, /sm:max-w-\[500px\]/);
});
