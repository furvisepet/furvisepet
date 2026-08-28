import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isCompleteAuthEmailOtp, normalizeAuthEmailOtp } from "../app/lib/auth-email-otp.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const layout = read("app/components/account-access.tsx");
const signupRoute = read("app/api/auth/signup/route.ts");
const resendRoute = read("app/api/auth/resend/route.ts");
const verifyRoute = read("app/api/auth/verify-email-otp/route.ts");
const responses = read("app/lib/security/auth-abuse/responses.ts");
const signupNeutral = responses.slice(responses.indexOf("SIGNUP_NEUTRAL_MESSAGE"), responses.indexOf("RECOVERY_NEUTRAL_MESSAGE"));
const slice = (start, end) => login.slice(login.indexOf(start), login.indexOf(end));
const submitAuth = slice("async function submitAuth", "function updateSignupOtp");
const updateOtp = slice("function updateSignupOtp", "function submitSignupOtp");
const submitOtp = slice("function submitSignupOtp", "async function verifySignupOtp");
const verifyOtp = slice("async function verifySignupOtp", "async function startGoogle");
const resend = slice("async function resendConfirmation", 'if (authStatus === "signedIn")');
const clearTransient = slice("function clearTransientAuthState", "function returnViewportToTop");
const otpRecovery = slice("function closeOtpRecovery", "function resetCaptchaAfterRequest");
const otpStep = slice("function SignupOtpStep", "function EmailInput");

test("OTP screen uses the compact Furvise copy and one obvious rectangular field", () => {
  assert.match(login, /"Confirm your email"/);
  assert.match(login, /We sent a code to <span className="inline-block max-w-full"><strong[\s\S]*\{email\}<\/strong>\.<\/span>/);
  assert.match(otpStep, /className="sr-only" htmlFor="signup-otp">Verification code<\/label>/);
  assert.equal((otpStep.match(/<input/g) || []).length, 1);
  assert.match(otpStep, /data-ui="signup-otp-input"/);
  assert.match(otpStep, /h-\[4\.25rem\]/);
  assert.match(otpStep, /max-w-\[18rem\]/);
  assert.match(otpStep, /rounded-xl border border-\[var\(--input-border\)\]/);
  assert.match(otpStep, /absolute inset-0 z-10 h-full w-full cursor-text/);
  assert.match(otpStep, /text-\[1\.625rem\][\s\S]*text-\[var\(--deep-forest\)\]/);
  assert.doesNotMatch(otpStep, /aspect-square|rounded-full border bg-\[var\(--input-background\)\] text-xl/);
});

test("the semantic OTP input preserves numeric, autofill, typing, and formatted paste behavior", () => {
  assert.match(otpStep, /aria-label="Verification code"/);
  assert.match(otpStep, /inputMode="numeric"/);
  assert.match(otpStep, /autoComplete="one-time-code"/);
  assert.match(otpStep, /maxLength=\{FURVISE_EMAIL_OTP_LENGTH\}/);
  assert.match(otpStep, /pattern=\{FURVISE_EMAIL_OTP_HTML_PATTERN\}/);
  assert.match(otpStep, /onPaste=\{\(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*event\.clipboardData\.getData\("text"\)/);
  assert.equal(normalizeAuthEmailOtp("12 34-56"), "123456");
  assert.equal(normalizeAuthEmailOtp("12a34b567"), "123456");
  assert.equal(isCompleteAuthEmailOtp("123456"), true);
  assert.equal(isCompleteAuthEmailOtp("12345"), false);
  assert.equal(isCompleteAuthEmailOtp("12345678"), false);
});

test("six digits and Enter verify once while invalid codes recover predictably", () => {
  assert.match(updateOtp, /isCompleteAuthEmailOtp\(normalized\)[\s\S]*verifySignupOtp\(normalized\)/);
  assert.match(submitOtp, /event\.preventDefault\(\)/);
  assert.match(submitOtp, /if \(!isCompleteAuthEmailOtp\(signupOtp\)\)[\s\S]*return/);
  assert.match(submitOtp, /verifySignupOtp\(signupOtp\)/);
  assert.match(verifyOtp, /if \(!isCompleteAuthEmailOtp\(code\) \|\| otpVerifyingRef\.current\) return/);
  assert.match(verifyOtp, /otpVerifyingRef\.current = true/);
  assert.equal((verifyOtp.match(/fetch\("\/api\/auth\/verify-email-otp"/g) || []).length, 1);
  assert.match(verifyOtp, /setSignupOtp\(""\)/);
  assert.match(verifyOtp, /otpInputRef\.current\?\.focus\(\)/);
  assert.match(verifyOtp, /otpInputRef\.current\?\.select\(\)/);
});

test("resend countdown is one compact line while protected resend authority stays unchanged", () => {
  assert.match(otpStep, /Didn&apos;t get it\?/);
  assert.match(otpStep, /Resend in \{resendCooldown\}s/);
  assert.match(otpStep, /"Resend code"/);
  assert.doesNotMatch(otpStep, /You can resend in|verification email|confirmation link/i);
  assert.match(otpStep, /resendChallengeVisible \? \([\s\S]*TurnstileChallenge/);
  assert.match(login, /const SIGNUP_RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(resend, /idempotentClientFetch\(endpoint/);
  assert.match(resend, /setStatusMessage\("New code sent\."\)/);
  assert.match(resendRoute, /requireCaptchaToken/);
  assert.match(resendRoute, /claimPublicAuthOperation/);
});

test("neutral repeated-signup outcomes always expose privacy-safe alternate recovery", () => {
  assert.match(submitAuth, /setSignupStep\("otp"\)/);
  assert.match(otpStep, /Try another way/);
  assert.match(otpStep, /Send me a sign-in code/);
  assert.match(otpStep, /Sign in with password/);
  assert.match(otpStep, /Use another email/);
  assert.match(responses, /SIGNUP_NEUTRAL_MESSAGE/);
  assert.doesNotMatch(`${login}\n${signupRoute}\n${signupNeutral}`, /user_repeated_signup|email already registered|account exists|email exists/i);
  assert.doesNotMatch(login, /email-exists|check-email|account-exists/i);
});

test("password recovery switches flows without carrying the signup password", () => {
  assert.match(otpRecovery, /function signInWithPasswordFromOtp\(\)/);
  assert.match(otpRecovery, /const normalizedEmail = normalizeAuthEmail\(email\)/);
  assert.match(otpRecovery, /clearTransientAuthState\(\)/);
  assert.match(otpRecovery, /setEmail\(normalizedEmail\)/);
  assert.match(otpRecovery, /setMode\("signin"\)/);
  assert.match(otpRecovery, /setSigninStep\("password"\)/);
  assert.match(clearTransient, /setPassword\(""\)/);
  assert.ok(otpRecovery.indexOf("clearTransientAuthState()") < otpRecovery.indexOf('setMode("signin")'));
  assert.doesNotMatch(otpRecovery, /setPassword\(password\)|signup password/i);
});

test("using another email clears every transient signup value and restores email focus", () => {
  assert.match(otpRecovery, /function useAnotherEmailFromOtp\(\)[\s\S]*returnToSignupEmail\(true\)/);
  for (const reset of [
    /otpAbortRef\.current\?\.abort\(\)/,
    /setPassword\(""\)/,
    /setSignupOtp\(""\)/,
    /setOtpVerifying\(false\)/,
    /setOtpRecoveryOpen\(false\)/,
    /setError\(""\)/,
    /setResendChallengeVisible\(false\)/,
    /setResendCooldown\(0\)/,
  ]) assert.match(clearTransient, reset);
  assert.match(otpRecovery, /emailInputRef\.current\?\.focus\(\)/);
});

test("alternate-method sheet and compact OTP shell remain mobile-safe and accessible", () => {
  assert.match(layout, /compact\?: boolean/);
  assert.match(layout, /compact \? "items-start" : "items-stretch"/);
  assert.match(layout, /compact \? "min-h-0" : "min-h-\[calc\(100svh-1\.5rem\)\]"/);
  assert.match(login, /compact=\{mode === "signup" && signupStep === "otp"\}/);
  assert.match(otpStep, /aria-modal="true"/);
  assert.match(otpStep, /role="dialog"/);
  assert.match(otpStep, /aria-labelledby="otp-recovery-title"/);
  assert.match(otpStep, /aria-label="Close alternate sign-in options"/);
  assert.match(otpStep, /size-11/);
  assert.match(otpStep, /event\.key !== "Tab"[\s\S]*button:not\(\[disabled\]\)[\s\S]*event\.preventDefault\(\)/);
  assert.match(otpStep, /items-end[\s\S]*sm:items-center/);
  assert.match(otpStep, /safe-area-inset-bottom/);
  assert.match(otpStep, /w-full max-w-sm/);
  assert.match(login, /event\.key !== "Escape"/);
  assert.doesNotMatch(otpStep, /h-screen|w-screen|overflow-x/);
  assert.doesNotMatch(`${signupRoute}\n${verifyRoute}\n${resendRoute}`, /user_repeated_signup/);
});
