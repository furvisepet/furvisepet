import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const security = read("app/settings/security/page.tsx");
const page = read("app/forgot-password/page.tsx");
const form = read("app/forgot-password/password-email-form.tsx");
const recoveryRoute = read("app/api/auth/recovery/route.ts");

test("provider-only password setup enters the explicit setup mode", () => {
  assert.match(security, /emailPasswordUser \? \([\s\S]*Change password[\s\S]*\) : \([\s\S]*href="\/forgot-password\?mode=setup">Set up/);
  assert.match(page, /params\.mode === "setup" \? await getVerifiedSetupEmail\(\) : null/);
  assert.match(page, /title=\{setupMode \? "Set up a password" : "Reset your password"\}/);
  assert.match(page, /supportingText=\{setupMode \? "We'll send a secure link to your verified email\." : undefined\}/);
});

test("setup mode derives only a confirmed signed-in email and ignores query email", () => {
  assert.match(page, /createServerSupabase\(\)/);
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /isConfirmedAuthUser\(data\.user\)/);
  assert.match(page, /getConnectedAuthProviders\(data\.user\)\.includes\("email"\)/);
  assert.match(page, /data\.user\?\.email\?\.trim\(\) \|\| null/);
  assert.doesNotMatch(page, /params\.email|searchParams\.email|get\("email"\)/);
  assert.match(page, /setupEmail=\{setupEmail\}/);
  assert.match(form, /const targetEmail = setupEmail \|\| email/);
});

test("setup mode has no arbitrary email input and uses the existing recovery action", () => {
  assert.match(form, /setupMode \? \([\s\S]*Verified email[\s\S]*\{setupEmail\}[\s\S]*\) : \([\s\S]*<AccountField label="Email"/);
  assert.match(form, /idempotentClientFetch\([\s\S]*"\/api\/auth\/recovery"/);
  assert.match(form, /JSON\.stringify\(\{ captchaToken: token, email: targetEmail \}\)/);
  assert.match(form, /challengeVisible \? <TurnstileChallenge/);
  assert.match(recoveryRoute, /supabase\.auth\.resetPasswordForEmail\(email, \{ captchaToken: captcha\.token, redirectTo \}\)/);
});

test("normal reset mode retains its original semantics and email entry", () => {
  assert.match(page, /title=\{setupMode \? "Set up a password" : "Reset your password"\}/);
  assert.match(form, /<AccountField label="Email" name="email">/);
  assert.match(form, /required type="email"/);
  assert.match(form, /setupMode \? "Send setup link" : "Send reset link"/);
  assert.match(form, /setupMode \? "Back to Login & Security" : "Back to sign in"/);
});

test("setup back and close return to Login and Security", () => {
  assert.match(page, /closeHref=\{setupMode \? "\/settings\/security" : "\/"\}/);
  assert.match(page, /closeLabel=\{setupMode \? "Close and return to Login & Security" : undefined\}/);
  assert.match(form, /href=\{setupMode \? "\/settings\/security" : "\/login"\}/);
});

test("connected password users retain the existing hardened change-password path", () => {
  assert.match(security, /state=\{emailPasswordUser \? "Connected" : "Not set up"\}/);
  assert.match(security, /emailPasswordUser \? \([\s\S]*setShowPasswordForm\(true\)[\s\S]*Change password/);
  assert.match(security, /data-ui="change-password-form"/);
  assert.match(security, /TurnstileChallenge/);
  assert.match(security, /"\/api\/account\/change-password"/);
});
