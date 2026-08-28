import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FURVISE_EMAIL_OTP_LENGTH,
  isCompleteAuthEmailOtp,
  isValidAuthEmailOtp,
  normalizeAuthEmailOtp,
} from "../app/lib/auth-email-otp.ts";
import { getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const startRoute = read("app/api/auth/login-otp/start/route.ts");
const verifyRoute = read("app/api/auth/verify-email-otp/route.ts");
const signupRoute = read("app/api/auth/signup/route.ts");
const resendRoute = read("app/api/auth/resend/route.ts");
const responses = read("app/lib/security/auth-abuse/responses.ts");
const loginOtpNeutral = responses.slice(responses.indexOf("LOGIN_OTP_NEUTRAL_MESSAGE"), responses.indexOf("RECOVERY_NEUTRAL_MESSAGE"));
const otpStep = login.slice(login.indexOf("function SignupOtpStep"), login.indexOf("function EmailInput"));
const otpRecovery = login.slice(login.indexOf("function closeOtpRecovery"), login.indexOf("function resetCaptchaAfterRequest"));
const resendClient = login.slice(login.indexOf("async function resendConfirmation"), login.indexOf('if (authStatus === "signedIn"'));

test("one shared six-digit contract owns UI normalization and server validation", () => {
  assert.equal(FURVISE_EMAIL_OTP_LENGTH, 6);
  assert.equal(normalizeAuthEmailOtp("12 34-56"), "123456");
  assert.equal(normalizeAuthEmailOtp("12345678"), "123456");
  assert.equal(isCompleteAuthEmailOtp("123456"), true);
  assert.equal(isCompleteAuthEmailOtp("12345678"), false);
  assert.equal(isValidAuthEmailOtp("123456"), true);
  assert.equal(isValidAuthEmailOtp("12345678"), false);
  assert.match(login, /maxLength=\{FURVISE_EMAIL_OTP_LENGTH\}/);
  assert.match(login, /Array\.from\(\{ length: FURVISE_EMAIL_OTP_LENGTH \}/);
  assert.match(login, /pattern=\{FURVISE_EMAIL_OTP_HTML_PATTERN\}/);
  assert.match(verifyRoute, /isValidAuthEmailOtp\(input\.token\)/);
  assert.doesNotMatch(verifyRoute, /\[0-9\]\{6\}|slice\(0, 6\)/);
});

test("login OTP start is exact, same-origin, bounded, CAPTCHA protected, and idempotent", () => {
  assert.match(startRoute, /export async function POST\(request: Request\)/);
  assert.doesNotMatch(startRoute, /export async function (?:GET|PUT|PATCH|DELETE)/);
  assert.match(startRoute, /validatePublicAuthOrigin\(request\)/);
  assert.match(startRoute, /readBoundedJson\(request, API_BODY_LIMITS\.standard\)/);
  assert.match(startRoute, /hasOnlyKeys\(body, \["email", "captchaToken"\]\)/);
  assert.match(startRoute, /normalizeAuthAbuseEmail\(input\.email\)/);
  assert.match(startRoute, /requireCaptchaToken\(input\.captchaToken\)/);
  assert.match(startRoute, /resolveIdempotencyKey\(request\)/);
  assert.match(startRoute, /claimPublicAuthOperation\(\{ email, flow: "login_otp_start"/);
  assert.ok(startRoute.indexOf("requireCaptchaToken") < startRoute.indexOf("supabase.auth.signInWithOtp"));
  assert.ok(startRoute.indexOf("enforceAuthInitiationLimit") < startRoute.indexOf("supabase.auth.signInWithOtp"));
});

test("login OTP can never create a user and returns one neutral provider response", () => {
  assert.match(startRoute, /supabase\.auth\.signInWithOtp\(\{[\s\S]*email,[\s\S]*options: \{ captchaToken: captcha\.token, shouldCreateUser: false \}/);
  assert.equal((startRoute.match(/shouldCreateUser: false/g) || []).length, 1);
  assert.match(responses, /LOGIN_OTP_NEUTRAL_MESSAGE = "If that email can receive a sign-in code, it’s on the way\."/);
  assert.match(startRoute, /claim === "replay"[\s\S]*LOGIN_OTP_NEUTRAL_MESSAGE/);
  assert.match(startRoute, /return authJson\(\{ message: LOGIN_OTP_NEUTRAL_MESSAGE, ok: true, requestId \}\)/);
  assert.doesNotMatch(`${startRoute}\n${loginOtpNeutral}`, /user_repeated_signup|already registered|email exists|account exists|user not found/i);
  assert.doesNotMatch(startRoute, /signUp|shouldCreateUser: true/);
});

test("login OTP start has dedicated fail-closed email and IP limits", () => {
  const policy = getRateLimitPolicy("AUTH_LOGIN_OTP_START", { NODE_ENV: "production" });
  assert.deepEqual(policy.email, { limit: 3, windowMs: 10 * 60_000 });
  assert.deepEqual(policy.ip, { limit: 10, windowMs: 10 * 60_000 });
  assert.equal(policy.failurePolicy, "fail_closed");
  assert.match(startRoute, /flow: "login_otp_start"/);
  assert.match(startRoute, /policy: "AUTH_LOGIN_OTP_START"/);
  assert.match(startRoute, /authUnavailableResponse\(requestId\)/);
});

test("generic email OTP verification retains server session and canonical routing authority", () => {
  assert.match(verifyRoute, /createServerSupabase\(\)/);
  assert.match(verifyRoute, /supabase\.auth\.verifyOtp\(\{ email, token, type: "email" \}\)/);
  assert.match(verifyRoute, /verification\.data\.session/);
  assert.match(verifyRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(verifyRoute, /isConfirmedAuthUser\(data\.user\)/);
  assert.match(verifyRoute, /ensureCanonicalApplicationUser\(supabase, data\.user\)/);
  assert.match(verifyRoute, /resolvePostAuthDestination\(hasPet, null\)/);
  assert.match(login, /fetch\("\/api\/auth\/verify-email-otp"/);
  assert.doesNotMatch(login, /verify-signup-otp/);
});

test("every OTP recovery sheet offers real sign-in OTP before password and email recovery", () => {
  const code = otpStep.indexOf("Send me a sign-in code");
  const password = otpStep.indexOf("Sign in with password");
  const email = otpStep.indexOf("Use another email");
  assert.ok(code >= 0 && password > code && email > password);
  assert.match(otpRecovery, /function startSignInOtpFromRecovery\(\)/);
  assert.match(otpRecovery, /clearTransientAuthState\(\)/);
  assert.match(otpRecovery, /setEmail\(normalizedEmail\)/);
  assert.match(otpRecovery, /setEmailOtpMode\("signin_otp"\)/);
  assert.match(otpRecovery, /setResendChallengeVisible\(true\)/);
  assert.match(otpRecovery, /setResendSubmitPending\(true\)/);
  assert.match(login, /emailOtpMode === "signin_otp" \? "Confirm it’s you" : "Confirm your email"/);
});

test("signup and sign-in OTP resends select only their matching protected send authority", () => {
  assert.match(resendClient, /emailOtpMode === "signin_otp" \? "\/api\/auth\/login-otp\/start" : "\/api\/auth\/resend"/);
  assert.match(resendClient, /emailOtpMode === "signin_otp" \? "auth-login-otp-start" : "auth-resend"/);
  assert.match(resendClient, /idempotentClientFetch\(endpoint/);
  assert.match(resendRoute, /supabase\.auth\.resend\(\{ type: "signup"/);
  assert.match(startRoute, /supabase\.auth\.signInWithOtp/);
  assert.match(otpStep, /resendChallengeVisible \? \([\s\S]*TurnstileChallenge/);
});

test("password fallback and use-another-email recovery preserve their safe reset semantics", () => {
  assert.match(otpRecovery, /function signInWithPasswordFromOtp\(\)[\s\S]*clearTransientAuthState\(\)[\s\S]*setEmail\(normalizedEmail\)[\s\S]*setMode\("signin"\)[\s\S]*setSigninStep\("password"\)/);
  assert.match(otpRecovery, /function useAnotherEmailFromOtp\(\)[\s\S]*returnToSignupEmail\(true\)[\s\S]*emailInputRef\.current\?\.focus\(\)/);
  assert.match(login, /setPassword\(""\)/);
  assert.match(signupRoute, /supabase\.auth\.signUp/);
  assert.doesNotMatch(signupRoute, /signInWithOtp/);
});

test("hosted six-digit and Magic Link template steps remain manual and exact", () => {
  const rollout = read("docs/signup-email-otp-rollout.md");
  assert.match(rollout, /Email OTP Length\*\* to `6`/);
  assert.match(rollout, /Select \*\*Magic Link\*\*/);
  assert.match(rollout, /Your Furvise sign-in code/);
  assert.match(rollout, /<h2>Confirm it’s you<\/h2>/);
  assert.match(rollout, /\{\{ \.Token \}\}/);
  assert.match(rollout, /Do not include `\{\{ \.ConfirmationURL \}\}`/);
  assert.match(rollout, /shouldCreateUser` remains `false`/);
});
