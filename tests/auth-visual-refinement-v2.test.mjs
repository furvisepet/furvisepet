import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const forgot = read("app/forgot-password/page.tsx");
const resetConfirm = read("app/reset-password/confirm/page.tsx");
const updatePassword = read("app/update-password/page.tsx");
const layout = read("app/components/account-access.tsx");
const globals = read("app/globals.css");
const turnstile = read("app/components/turnstile-challenge.tsx");
const googleAsset = read("public/icons/google-g.svg");

const slice = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const signinMethod = slice(login, "function SigninMethodStep", "function SigninPasswordStep");
const signinPassword = slice(login, "function SigninPasswordStep", "function SignupMethodStep");
const signupMethod = slice(login, "function SignupMethodStep", "function SignupPasswordStep");
const signupPassword = slice(login, "function SignupPasswordStep", "function SignupOtpStep");
const signupOtp = slice(login, "function SignupOtpStep", "function EmailInput");
const requestAuth = slice(login, "function requestAuthSubmission", "function handleAuthChallengeToken");
const handleAuthToken = slice(login, "function handleAuthChallengeToken", "async function submitAuth");
const submitAuth = slice(login, "async function submitAuth", "async function startGoogle");
const requestResend = slice(login, "function requestResendConfirmation", "function handleResendChallengeToken");
const handleResendToken = slice(login, "function handleResendChallengeToken", "async function resendConfirmation");
const resend = slice(login, "async function resendConfirmation", 'if (authStatus === "signedIn"');
const googleButton = slice(login, "function GoogleButton", "function AuthDivider");
const googleIcon = login.slice(login.indexOf("function GoogleIcon"));
const signinBack = slice(login, "function returnToSigninEmail", "function resetCaptchaAfterRequest");
const signupBack = slice(login, "function returnToSignupEmail", "function continueSigninWithEmail");

test("every auth card shares centered heron and introduction chrome while forms stay labeled", () => {
  assert.match(layout, /data-ui="account-access-intro"/);
  assert.match(layout, /className="text-center" data-ui="account-access-intro"/);
  assert.match(layout, /mb-5 flex justify-center[\s\S]*<BrandMark priority showName=\{false\} size=\{30\} \/>/);
  assert.match(layout, /data-ui="account-access-form"/);
  assert.doesNotMatch(layout, /showBrand|centeredIntro|furvise-wordmark/);
  assert.doesNotMatch(login, /showBrand|centeredIntro/);
  for (const consumer of [login, forgot, resetConfirm, updatePassword]) {
    assert.match(consumer, /<AccountAccessLayout/);
  }
  for (const method of [signinMethod, signupMethod]) {
    assert.match(method, /<form className="grid gap-4"/);
    assert.match(method, /<EmailInput/);
  }
  assert.match(login, /<AccountField label="Email" name="email">/);
  assert.match(login, /<AccountField label="Password" name="password">/);
  assert.match(layout, /supportingText\?: React\.ReactNode/);
  assert.match(layout, /\{supportingText \? <p[\s\S]*\{supportingText\}<\/p> : null\}/);
  assert.match(layout, /<div className="mt-6 sm:mt-7" data-ui="account-access-form">/);
});

test("reviewed auth copy and task headings are exact", () => {
  for (const copy of [
    "Welcome back",
    "Create your account",
    "Enter your password",
    "Create a password",
    "Confirm your email",
  ]) assert.match(login, new RegExp(copy.replace(/[.?]/g, "\\$&")));
  assert.doesNotMatch(login, /Sign in to pick up where you left off|Signing in as|Add your pet to get started|Secure your account|Creating an account for|We sent a verification link to/);
  assert.match(login, /signupStep === "otp"[\s\S]*Enter the code for <span className="inline-block max-w-full"><strong className="break-all font-semibold text-\[var\(--text-primary\)\]">\{email\}<\/strong>\.<\/span>/);
  assert.doesNotMatch(login, /We sent a code to/);
  assert.doesNotMatch(signupPassword, /Use 12 to 128 characters\./);
  assert.match(signupPassword, /Password needs at least 12 characters\./);
  assert.match(forgot, /title="Reset your password"/);
  assert.doesNotMatch(forgot, /Enter your email and we’ll send you a reset link\./);
  assert.match(updatePassword, /title="Choose a new password"/);
  assert.doesNotMatch(updatePassword, /Set a new password for your Furvise account|Set a new password for \$\{email\}|Use 12 to 128 characters/);
  assert.match(updatePassword, /Password needs at least 12 characters\./);
  assert.match(updatePassword, /id="new-password"[\s\S]*maxLength=\{128\}[\s\S]*minLength=\{12\}/);
  assert.match(updatePassword, /id="confirm-password"[\s\S]*maxLength=\{128\}[\s\S]*minLength=\{12\}/);
  assert.doesNotMatch(login, /Sign in to continue caring for your pets|Start with your pet\. We’ll help with the rest/);
});

test("auth primaries keep forest contrast and disabled controls remain branded and readable", () => {
  assert.match(layout, /accountPrimaryClass[\s\S]*bg-\[var\(--deep-forest\)\][\s\S]*text-\[color:var\(--warm-cream\)\]/);
  assert.match(layout, /account-auth-primary/);
  assert.match(globals, /\.account-auth-primary \{[\s\S]*color: var\(--warm-cream\)/);
  assert.match(globals, /\.account-auth-primary:disabled,[\s\S]*color: var\(--deep-forest\)/);
  assert.match(layout, /disabled:cursor-not-allowed/);
  assert.match(layout, /disabled:bg-\[var\(--soft-sage\)\]/);
  assert.match(layout, /disabled:text-\[color:var\(--deep-forest\)\]/);
  assert.match(layout, /disabled:opacity-100/);
  assert.doesNotMatch(layout, /accountPrimaryClass[\s\S]*bg-\[var\(--action-primary\)\]/);
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

test("password steps use safe Back semantics while Close and shared branding remain universal", () => {
  assert.match(login, /backLabel="Back to email"/);
  assert.match(login, /onBack=\{passwordStep \? returnToEmail : undefined\}/);
  assert.match(layout, /aria-label=\{backLabel\}/);
  assert.match(layout, /aria-label="Close and return to Furvise home"/);
  assert.match(layout, /href="\/"/);
  assert.match(layout, /accountCornerControlClass =[\s\S]*min-h-11 min-w-11/);
  assert.match(layout, /accountCornerControlClass =[\s\S]*rounded-full border border-\[var\(--line\)\]/);
  assert.doesNotMatch(`${signinPassword}\n${signupPassword}`, /Change email/);
  assert.doesNotMatch(signupOtp, /onBack/);
  assert.match(signupOtp, /Use another email/);
  assert.match(signinBack, /clearTransientAuthState\(\)[\s\S]*setSigninStep\("method"\)/);
  assert.match(signupBack, /clearTransientAuthState\(\)[\s\S]*if \(clearEmail\) setEmail\(""\)[\s\S]*setSignupStep\("method"\)/);
  assert.match(login, /const returnToEmail = mode === "signin" \? returnToSigninEmail : \(\) => returnToSignupEmail\(false\)/);
  assert.match(login, /useAnotherEmail=\{useAnotherEmailFromOtp\}/);
  assert.match(forgot, /href="\/login">Back to sign in<\/Link>/);
});

test("Auth challenge mounts on submit and one valid token resumes exactly one guarded request", () => {
  for (const password of [signinPassword, signupPassword]) {
    assert.match(password, /authChallengeVisible \? <TurnstileChallenge/);
    assert.match(password, /onSubmit=\{requestAuthSubmission\}/);
  }
  assert.match(requestAuth, /authSubmitPendingRef\.current = true/);
  assert.match(requestAuth, /setAuthChallengeVisible\(true\)/);
  assert.doesNotMatch(requestAuth, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.match(handleAuthToken, /if \(!token\) \{[\s\S]*authSubmitPendingRef\.current = false;[\s\S]*setAuthSubmitPending\(false\)/);
  assert.match(handleAuthToken, /if \(!authSubmitPendingRef\.current\) return/);
  assert.match(handleAuthToken, /authSubmitPendingRef\.current = false/);
  assert.match(handleAuthToken, /authCaptchaTokenRef\.current = null/);
  assert.match(handleAuthToken, /setAuthSubmitPending\(false\)/);
  assert.equal((handleAuthToken.match(/submitAuth\(token\)/g) || []).length, 1);
  assert.ok(handleAuthToken.indexOf("setAuthSubmitPending(false)") < handleAuthToken.indexOf("submitAuth(token)"));
  assert.match(requestAuth, /if \(authCaptchaTokenRef\.current\) \{[\s\S]*authCaptchaTokenRef\.current = null;[\s\S]*submitAuth\(token\)/);
  assert.equal((requestAuth.match(/submitAuth\(token\)/g) || []).length, 1);
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
  assert.match(handleResetToken, /if \(!token\) \{[\s\S]*submitPendingRef\.current = false;[\s\S]*setSubmitPending\(false\)/);
  assert.match(handleResetToken, /if \(!submitPendingRef\.current\) return/);
  assert.equal((handleResetToken.match(/submitReset\(token\)/g) || []).length, 1);
  assert.match(submitReset, /if \(!token\) return/);
  assert.match(submitReset, /captchaToken: token/);
  assert.match(requestResend, /setResendChallengeVisible\(true\)/);
  assert.doesNotMatch(requestResend, /idempotentClientFetch|\/api\/auth\/resend/);
  assert.match(handleResendToken, /if \(!token\) \{[\s\S]*resendSubmitPendingRef\.current = false;[\s\S]*setResendSubmitPending\(false\)/);
  assert.match(handleResendToken, /if \(!resendSubmitPendingRef\.current\) return/);
  assert.equal((handleResendToken.match(/resendConfirmation\(token\)/g) || []).length, 1);
  assert.match(resend, /if \(!normalizedEmail \|\| !token/);
  assert.match(resend, /emailOtpMode === "signin_otp" \? "\/api\/auth\/login-otp\/start" : "\/api\/auth\/resend"/);
  assert.match(resend, /idempotentClientFetch\(endpoint,[\s\S]*captchaToken: token/);
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
  assert.match(layout, /motion-reduce:animate-none/);
  assert.match(layout, />Checking security…<\/span>/);
  assert.match(layout, /role="status"/);
  assert.match(login, /data-ui="signup-otp-actions"/);
  assert.doesNotMatch(signupOtp, /h-screen|justify-between|flex-1/);
});
