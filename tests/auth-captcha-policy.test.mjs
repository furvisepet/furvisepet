import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export {}' };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier, context.parentURL);
    if (existsSync(fileURLToPath(url.href + '.ts'))) return nextResolve(url.href + '.ts', context);
  }
  return nextResolve(specifier, context);
} });
const { isAuthCaptchaEnabled } = await import('../app/lib/auth-captcha-policy.ts');
const { requireCaptchaToken, resolveLoginCaptcha } = await import('../app/lib/security/auth-abuse/captcha.ts');

test('only the explicit deployment setting disables CAPTCHA, including required login challenges', () => {
  const off = { NODE_ENV: 'production', NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED: 'false' };
  assert.equal(isAuthCaptchaEnabled(off), false);
  for (const token of [undefined, null, 'stale-client-token']) {
    assert.deepEqual(requireCaptchaToken(token, off), { allowed: true, bypassed: true, token: undefined });
    assert.deepEqual(resolveLoginCaptcha({ captchaToken: token }, true, off), { allowed: true, bypassed: true, token: undefined });
  }
});

test('missing or malformed settings retain protection; request data cannot turn it off', () => {
  for (const value of [undefined, 'true', 'FALSE', '', '0']) {
    const on = { NODE_ENV: 'production', NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED: value };
    assert.equal(isAuthCaptchaEnabled(on), true);
    assert.equal(requireCaptchaToken(undefined, on).allowed, false);
    assert.equal(resolveLoginCaptcha({ NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED: 'false' }, true, on).allowed, false);
    assert.equal(requireCaptchaToken('valid-turnstile-token', on).token, 'valid-turnstile-token');
  }
});
