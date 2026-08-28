import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = source("app/login/page.tsx");
const route = source("app/api/auth/account-route/route.ts");
const lookup = source("app/lib/supabase/account-route-admin.ts");
const siteverify = source("app/lib/security/auth-abuse/turnstile-siteverify.ts");
const challenge = source("app/components/turnstile-challenge.tsx");

const slice = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end));
const intent = slice(login, "function continueSignupWithEmail", "function handleAccountRouteChallengeToken");
const tokenHandler = slice(login, "function handleAccountRouteChallengeToken", "async function routeSignupEmail");
const request = slice(login, "async function routeSignupEmail", "function requestAuthSubmission");
const method = slice(login, "function SignupMethodStep", "function SignupPasswordStep");
const otp = slice(login, "function SignupOtpStep", "function EmailInput");

test("account classification route is a bounded same-origin POST with exact inputs and private flow-only success", () => {
  assert.match(route, /export async function POST\(request: Request\)/);
  assert.doesNotMatch(route, /export (?:async )?function GET/);
  assert.match(route, /validatePublicAuthOrigin\(request\)/);
  assert.match(route, /readBoundedJson\(request, API_BODY_LIMITS\.standard\)/);
  assert.match(route, /hasOnlyKeys\(body, \["email", "captchaToken"\]\)/);
  assert.match(route, /normalizeAuthAbuseEmail\(input\.email\)/);
  assert.match(route, /authJson\(\{ flow: exists \? "signin" : "signup" \}\)/);
  assert.doesNotMatch(route, /userId|provider|identity|metadata|app_metadata|user_metadata/);
  assert.match(source("app/lib/security/auth-abuse/responses.ts"), /PRIVATE_CACHE_HEADERS/);
});

test("account classification requires server Siteverify and fail-closed distributed IP and email limits", () => {
  const handler = route.slice(route.indexOf("export async function POST"));
  assert.match(route, /requireCaptchaToken\(input\.captchaToken\)/);
  assert.match(route, /flow: "account_route"/);
  assert.match(route, /policy: "AUTH_ACCOUNT_ROUTE"/);
  assert.match(route, /verifyTurnstileToken\(\{[\s\S]*action: "account_route"[\s\S]*remoteIp: resolveClientIp\(request\)[\s\S]*token: captcha\.token/);
  assert.ok(handler.indexOf("validatePublicAuthOrigin") < handler.indexOf("enforceAuthInitiationLimit"));
  assert.ok(handler.indexOf("enforceAuthInitiationLimit") < handler.indexOf("verifyTurnstileToken"));
  assert.ok(handler.indexOf("verifyTurnstileToken") < handler.indexOf("authUserExistsByEmail"));
  const policy = getRateLimitPolicy("AUTH_ACCOUNT_ROUTE", { NODE_ENV: "production" });
  assert.deepEqual(policy.email, { limit: 3, windowMs: 10 * 60_000 });
  assert.deepEqual(policy.ip, { limit: 10, windowMs: 10 * 60_000 });
  assert.equal(policy.failurePolicy, "fail_closed");
  assert.match(route, /AUTH_PROTECTION_UNAVAILABLE|authUnavailableResponse/);
});

test("Siteverify validates the one-time token, action, hostname, IP, and request id without leaking the secret", () => {
  assert.match(siteverify, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(siteverify, /env\.TURNSTILE_SECRET_KEY/);
  assert.match(siteverify, /response: input\.token/);
  assert.match(siteverify, /idempotency_key: input\.requestId/);
  assert.match(siteverify, /body\.set\("remoteip", input\.remoteIp\)/);
  assert.match(siteverify, /payload\.success !== true/);
  assert.match(siteverify, /payload\.action !== input\.action/);
  assert.match(siteverify, /payload\.hostname !== input\.expectedHostname/);
  assert.match(siteverify, /cache: "no-store"/);
  assert.doesNotMatch(siteverify, /console\.|NEXT_PUBLIC_TURNSTILE_SECRET|SUPABASE/);
});

test("privileged lookup is server-only, uses only SUPABASE_SECRET_KEY, and exposes no admin capability to the client", () => {
  assert.match(lookup, /^import "server-only";/);
  assert.match(lookup, /env\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(lookup, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_SECRET|createUser|deleteUser|updateUser|rpc\(/);
  assert.match(lookup, /\/auth\/v1\/admin\/users/);
  assert.match(lookup, /searchParams\.set\("filter", email\)/);
  assert.match(lookup, /cache: "no-store"/);
  assert.match(lookup, /user\.email\.normalize\("NFKC"\)\.trim\(\)\.toLowerCase\(\) === email/);
  assert.doesNotMatch(login, /SUPABASE_SECRET_KEY|\/auth\/v1\/admin\/users/);
});

test("signup Continue lazily classifies only after Turnstile and cannot create or resend an account", () => {
  assert.match(intent, /normalizeAuthEmail\(email\)/);
  assert.match(intent, /accountRoutePendingRef\.current = true/);
  assert.match(intent, /setAccountRouteChallengeVisible\(true\)/);
  assert.doesNotMatch(intent, /fetch|\/api\/auth/);
  assert.match(method, /accountRouteChallengeVisible \? <TurnstileChallenge action="account_route"/);
  assert.match(challenge, /\.\.\.\(action \? \{ action \} : \{\}\)/);
  assert.match(tokenHandler, /if \(!token\)/);
  assert.match(tokenHandler, /if \(!accountRoutePendingRef\.current\) return/);
  assert.equal((tokenHandler.match(/routeSignupEmail\(token\)/g) || []).length, 1);
  assert.match(request, /fetch\("\/api\/auth\/account-route"/);
  assert.doesNotMatch(request, /\/api\/auth\/(?:signup|resend)|idempotentClientFetch/);
});

test("existing accounts route directly to an empty sign-in password step while new accounts route to create password", () => {
  assert.match(request, /if \(payload\.flow === "signin"\) \{[\s\S]*setMode\("signin"\)[\s\S]*setSigninStep\("password"\)[\s\S]*setSignupStep\("method"\)/);
  assert.match(request, /else \{[\s\S]*setMode\("signup"\)[\s\S]*setSigninStep\("method"\)[\s\S]*setSignupStep\("password"\)/);
  assert.match(request, /clearTransientAuthState\(\);[\s\S]*setEmail\(normalizedEmail\)/);
  assert.match(slice(login, "function clearTransientAuthState", "function returnViewportToTop"), /setPassword\(""\)/);
  assert.doesNotMatch(request, /setSignupStep\("otp"\)|submitAuth\(|resendConfirmation\(/);
  assert.match(login, /const returnToEmail = mode === "signin" \? returnToSigninEmail/);
});

test("OTP semantic input is fully transparent so only the six Furvise-rendered positions are visible", () => {
  assert.match(otp, /autoComplete="one-time-code"/);
  assert.match(otp, /inputMode="numeric"/);
  assert.match(otp, /maxLength=\{FURVISE_EMAIL_OTP_LENGTH\}/);
  assert.match(otp, /bg-transparent text-transparent caret-transparent opacity-0/);
  assert.match(otp, /\[-webkit-text-fill-color:transparent\]/);
  assert.match(otp, /style=\{\{ WebkitTextFillColor: "transparent" \}\}/);
  assert.match(otp, /Array\.from\(\{ length: FURVISE_EMAIL_OTP_LENGTH \}/);
  assert.doesNotMatch(otp, /opacity-\[0\.01\]/);
});

test("sign-in OTP recovery, password fallback, signup security, and recovery authority remain intact", () => {
  assert.match(login, /Send me a sign-in code/);
  assert.match(login, /Sign in with password/);
  assert.match(login, /Use another email/);
  assert.match(login, /emailOtpMode === "signin_otp" \? "\/api\/auth\/login-otp\/start" : "\/api\/auth\/resend"/);
  assert.match(login, /endpoint = mode === "signin" \? "\/api\/auth\/login" : "\/api\/auth\/signup"/);
  assert.match(login, /idempotentClientFetch\(endpoint, init, `auth-signup:/);
  assert.match(source("app/api/auth/signup/route.ts"), /validateAuthPassword/);
  assert.match(source("app/api/auth/login-otp/start/route.ts"), /shouldCreateUser: false/);
  assert.match(source("app/auth/callback/route.ts"), /exchangeCodeForSession/);
});
