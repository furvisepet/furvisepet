import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveLoginCaptchaPolicy, validateCaptchaToken } from "../app/lib/security/auth-abuse/login-captcha.ts";

const resolveLoginCaptcha = (input, challengeRequired) =>
  resolveLoginCaptchaPolicy(input, challengeRequired, validateCaptchaToken);

test("a valid client-provided CAPTCHA token is forwarded without an internal challenge", () => {
  const token = "valid-turnstile-token";
  const captcha = resolveLoginCaptcha({ captchaToken: token }, false);
  const route = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");

  assert.deepEqual(captcha, { allowed: true, bypassed: false, token });
  assert.match(route, /signInWithPassword\([\s\S]*captchaToken: captcha\.token/);
});

test("an ordinary initial login does not forward a CAPTCHA token", () => {
  assert.deepEqual(resolveLoginCaptcha({}, false), {
    allowed: true,
    bypassed: false,
    token: undefined,
  });
});

test("an internally required CAPTCHA challenge rejects a missing token", () => {
  assert.deepEqual(resolveLoginCaptcha({}, true), {
    allowed: false,
    code: "CAPTCHA_REQUIRED",
  });
});

test("malformed client-provided CAPTCHA tokens are rejected", () => {
  for (const captchaToken of [null, "", "short", "valid-token-with-control\ncharacter", 123]) {
    assert.deepEqual(resolveLoginCaptcha({ captchaToken }, false), {
      allowed: false,
      code: "CAPTCHA_REQUIRED",
    });
  }
});
