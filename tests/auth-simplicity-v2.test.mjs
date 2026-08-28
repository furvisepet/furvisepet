import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const layout = read("app/components/account-access.tsx");
const turnstile = read("app/components/turnstile-challenge.tsx");
const signinAdvance = login.slice(login.indexOf("function continueSigninWithEmail"), login.indexOf("function returnToSigninEmail"));
const signinReset = login.slice(login.indexOf("function returnToSigninEmail"), login.indexOf("function resetCaptchaAfterRequest"));
const requestAuth = login.slice(login.indexOf("function requestAuthSubmission"), login.indexOf("function handleAuthChallengeToken"));
const authTokenHandler = login.slice(login.indexOf("function handleAuthChallengeToken"), login.indexOf("async function submitAuth"));
const submitAuth = login.slice(login.indexOf("async function submitAuth"), login.indexOf("async function startGoogle"));
const signinMethod = login.slice(login.indexOf("function SigninMethodStep"), login.indexOf("function SigninPasswordStep"));
const signinPassword = login.slice(login.indexOf("function SigninPasswordStep"), login.indexOf("function SignupMethodStep"));
const signupMethod = login.slice(login.indexOf("function SignupMethodStep"), login.indexOf("function SignupPasswordStep"));
const signupPassword = login.slice(login.indexOf("function SignupPasswordStep"), login.indexOf("function SignupVerificationStep"));
const signupVerify = login.slice(login.indexOf("function SignupVerificationStep"), login.indexOf("function EmailInput"));
const googleButton = login.slice(login.indexOf("function GoogleButton"), login.indexOf("function AuthDivider"));
const googleIcon = login.slice(login.indexOf("function GoogleIcon"));
const googleAsset = read("public/icons/google-g.svg");

test("sign-in starts with one local email decision", () => {
  assert.match(login, /type SigninStep = "method" \| "password"/);
  assert.match(login, /useState<SigninStep>\("method"\)/);
  assert.match(signinMethod, /EmailInput/);
  assert.match(signinMethod, />Continue<\/button>/);
  assert.doesNotMatch(signinMethod, /PasswordInput|TurnstileChallenge|Forgot password|Keep me signed in/);
  assert.match(signinAdvance, /event\.preventDefault\(\)/);
  assert.match(signinAdvance, /normalizeAuthEmail\(email\)/);
  assert.match(signinAdvance, /setEmail\(normalizedEmail\)/);
  assert.match(signinAdvance, /setSigninStep\("password"\)/);
  assert.doesNotMatch(signinAdvance, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.doesNotMatch(login, /email-exists|check-email|account-exists/i);
});

test("sign-in password step owns credentials, recovery, and CAPTCHA", () => {
  assert.match(login, /const signinTitle = signinStep === "method" \? "Welcome back" : "Enter your password"/);
  assert.match(login, /Signing in as[\s\S]*\{email\}/);
  assert.doesNotMatch(signinPassword, /Change email/);
  assert.match(login, /onBack=\{passwordStep \? returnToEmail : undefined\}/);
  assert.match(layout, /aria-label=\{backLabel\}/);
  assert.match(signinPassword, /autoComplete="current-password"/);
  assert.match(signinPassword, /minLength=\{1\}/);
  assert.match(signinPassword, /href="\/forgot-password"/);
  assert.match(signinPassword, /authChallengeVisible \? <TurnstileChallenge/);
  assert.match(signinPassword, /\{loading \? "Signing in\.\.\." : authSubmitPending \? "Checking security\.\.\." : "Sign in"\}/);
  assert.match(signinReset, /clearTransientAuthState\(\)/);
  assert.match(signinReset, /setSigninStep\("method"\)/);
});

test("login authority, generic errors, and fail-closed CAPTCHA serialization remain intact", () => {
  assert.match(requestAuth, /if \(mode === "signin" && signinStep !== "password"\) return/);
  assert.match(requestAuth, /authSubmitPendingRef\.current = true/);
  assert.match(requestAuth, /setAuthChallengeVisible\(true\)/);
  assert.doesNotMatch(requestAuth, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.match(authTokenHandler, /if \(!token \|\| !authSubmitPendingRef\.current\) return/);
  assert.match(authTokenHandler, /authSubmitPendingRef\.current = false/);
  assert.equal((authTokenHandler.match(/submitAuth\(token\)/g) || []).length, 1);
  assert.match(submitAuth, /if \(!token\) return/);
  assert.match(submitAuth, /endpoint = mode === "signin" \? "\/api\/auth\/login" : "\/api\/auth\/signup"/);
  assert.match(submitAuth, /captchaToken: token/);
  assert.match(submitAuth, /await fetch\(endpoint, init\)/);
  assert.match(signinPassword, /disabled=\{!authChecked \|\| loading \|\| authSubmitPending \|\| Boolean\(configError\)\}/);
  assert.match(submitAuth, /"Email or password is incorrect\."/);
  assert.doesNotMatch(submitAuth, /user not found|email exists|account exists/i);
});

test("removing the session checkbox preserves its previous persistent default", () => {
  assert.doesNotMatch(login, /Keep me signed in|keepSignedIn|setKeepSignedIn|"session"/);
  assert.match(submitAuth, /setBrowserSupabasePersistence\(null\)/);
  assert.equal((submitAuth.match(/setBrowserSupabasePersistence\(null\)/g) || []).length, 1);
});

test("Google stays method-only, icon-only, accessible, and feature-gated", () => {
  assert.match(signinMethod, /GOOGLE_AUTH_ENABLED \? <>/);
  assert.match(signupMethod, /GOOGLE_AUTH_ENABLED \? <>/);
  assert.match(googleButton, /aria-label="Continue with Google"/);
  assert.match(googleButton, /title="Continue with Google"/);
  assert.match(googleButton, /className="mx-auto flex size-14/);
  assert.match(googleButton, /border-\[var\(--line\)\]/);
  assert.match(googleButton, /<span className="sr-only">/);
  assert.match(googleIcon, /<Image alt="" height=\{20\} src="\/icons\/google-g\.svg" width=\{20\} \/>/);
  for (const color of ["#4285F4", "#34A853", "#FBBC05", "#EA4335"]) assert.match(googleAsset, new RegExp(`fill="${color}"`));
  assert.doesNotMatch(googleIcon, /currentColor/);
  assert.match(login, /signInWithGoogle\(nextPath\)/);
  assert.doesNotMatch(signinPassword, /GoogleButton/);
  assert.doesNotMatch(signupPassword, /GoogleButton/);
  assert.doesNotMatch(signupVerify, /GoogleButton/);
  assert.doesNotMatch(login, /Continue with Apple/);
});

test("signup method shares email-first hierarchy while protected steps stay unchanged", () => {
  assert.ok(signupMethod.indexOf("<form") < signupMethod.indexOf("<AuthDivider"));
  assert.ok(signupMethod.indexOf(">Continue</button>") < signupMethod.indexOf("<GoogleButton"));
  assert.match(signupPassword, /minLength=\{12\}/);
  assert.match(signupPassword, /maxLength=\{128\}/);
  assert.match(signupPassword, /Use 12 to 128 characters\./);
  assert.match(signupPassword, /authChallengeVisible \? <TurnstileChallenge/);
  assert.match(submitAuth, /idempotentClientFetch\(endpoint, init, `auth-signup:\$\{normalizedEmail\}`\)/);
  assert.match(signupVerify, /"Resend email"/);
  assert.match(signupVerify, /Use a different email/);
  assert.doesNotMatch(signupVerify, /PasswordInput|GoogleButton/);
});

test("Turnstile uses official interaction-only rendering without concealing provider interaction", () => {
  assert.match(turnstile, /window\.turnstile\.render\(elementRef\.current, \{[\s\S]*appearance: "interaction-only"/);
  assert.match(turnstile, /callback: \(token: string\)[\s\S]*onTokenRef\.current\(token\)/);
  assert.match(turnstile, /"error-callback": \(\) => \{[\s\S]*onTokenRef\.current\(null\)/);
  assert.match(turnstile, /"expired-callback": \(\) => onTokenRef\.current\(null\)/);
  assert.match(turnstile, />Retry security check<\/button>/);
  assert.match(turnstile, /<div ref=\{elementRef\} \/>/);
  assert.doesNotMatch(turnstile, /display:\s*none|visibility:\s*hidden|opacity:\s*0|clip-path|overflow-hidden/i);
  assert.doesNotMatch(turnstile, /requestSubmit|autoSubmit/);
});

test("auth surface removes the nav bar and keeps method branding inside the mobile-safe card", () => {
  assert.doesNotMatch(layout, /<header|<nav|furvise-wordmark|FURVISE_WORDMARK_ASSET/);
  assert.match(layout, /data-ui="account-access-surface"/);
  assert.match(layout, /showBrand \? \([\s\S]*<BrandMark priority showName=\{false\} size=\{30\} \/>/);
  assert.match(login, /const initialMethodStep = mode === "signin" \? signinStep === "method" : signupStep === "method"/);
  assert.match(login, /showBrand=\{initialMethodStep\}/);
  assert.match(login, /centeredIntro=\{initialMethodStep\}/);
  assert.match(layout, /className=\{centeredIntro \? "text-center" : undefined\}/);
  assert.match(layout, /aria-label="Close and return to Furvise home"/);
  assert.match(layout, /href="\/"/);
  assert.match(layout, /min-h-11 min-w-11/);
  assert.match(layout, /safe-area-inset-top/);
  assert.match(layout, /safe-area-inset-bottom/);
  assert.match(layout, /overflow-x-hidden/);
  assert.match(layout, /min-h-\[calc\(100svh-1\.5rem\)\]/);
  assert.match(layout, /rounded-\[1\.75rem\]/);
  assert.match(layout, /text-\[2rem\][\s\S]*sm:text-\[2\.375rem\]/);
  assert.match(layout, /sm:max-w-\[500px\]/);
});

test("all auth primaries use the shared forest treatment and retired sign-in clutter stays absent", () => {
  assert.match(layout, /accountPrimaryClass[\s\S]*bg-\[var\(--deep-forest\)\]/);
  assert.doesNotMatch(layout, /accountPrimaryClass[\s\S]*bg-\[var\(--action-primary\)\]/);
  assert.doesNotMatch(login, /accountSignupPrimaryClass|Keep me signed in/);
  assert.doesNotMatch(login, /Your pets, notes, conversations, and Vet Visit Briefs stay private to your account\./);
});

test("recovery, reauthentication, safe redirects, and callback authority remain wired", () => {
  const callback = read("app/auth/callback/route.ts");
  const forgot = read("app/forgot-password/page.tsx");
  const loginRoute = read("app/api/auth/login/route.ts");
  assert.match(login, /passwordResetSucceeded/);
  assert.match(login, /isPetDeleteReauthentication/);
  assert.match(login, /getSafeNextPath\(searchParams\.get\("next"\) \|\| searchParams\.get\("returnTo"\), "\/today"\)/);
  assert.match(forgot, /idempotentClientFetch\("\/api\/auth\/recovery"/);
  assert.match(forgot, /challengeVisible \? <TurnstileChallenge/);
  assert.match(loginRoute, /resolveLoginCaptcha\(input, challengeRequired\)/);
  assert.match(loginRoute, /if \(!captcha\.allowed\) return captchaRequiredResponse/);
  assert.match(loginRoute, /signInWithPassword\(\{ email, password, options: \{ captchaToken: captcha\.token \} \}\)/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /ensureCanonicalApplicationUser/);
  assert.match(callback, /resolvePostGoogleAuthDestination/);
});
