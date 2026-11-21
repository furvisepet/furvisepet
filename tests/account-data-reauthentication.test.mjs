import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getSafeNextPath } from '../app/lib/auth-routing.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('account data recovery returns to its safe page without automatically repeating a sensitive action', () => {
  const page = read('app/settings/data-privacy/page.tsx');
  const href = page.match(/href="([^"]*reauth=account-data)"/)[1];
  const url = new URL(href, 'https://furvise.local');
  assert.equal(url.pathname, '/login');
  assert.equal(getSafeNextPath(url.searchParams.get('next')), '/settings/data-privacy');
  assert.match(page, /setReauthRequired\(body\?\.code === "RECENT_AUTH_REQUIRED"\)/);
  assert.doesNotMatch(page, /useEffect|autoExport|autoDelete/);
  assert.match(page, /deleteConfirmation !== "DELETE"/);
  assert.equal(getSafeNextPath('https://evil.example'), '/today');
});

test('reauthentication keeps the login form available for existing sessions and does not weaken API guards', () => {
  const login = read('app/login/page.tsx');
  assert.match(login, /reauthValues\.length === 1 && reauthValues\[0\] === "account-data"/);
  assert.match(login, /isReauthentication \|\| didRedirectRef\.current/);
  assert.match(login, /authStatus === "signedIn" && !isReauthentication/);
  for (const path of ['app/api/account/export/route.ts', 'app/api/account/delete/route.ts']) {
    assert.match(read(path), /requireRecentInteractiveAuthentication/);
  }
});

test('account data requests use the fresh same-origin session after password reauthentication', () => {
  const page = read('app/settings/data-privacy/page.tsx');
  const login = read('app/login/page.tsx');
  assert.match(login, /if \(isReauthentication\) \{[^}]*window\.location\.replace\(nextPath\)/);
  assert.match(page, /"\/api\/account\/export",\s*\{ credentials: "same-origin", method: "POST" \}/);
  assert.match(page, /"\/api\/account\/delete",[\s\S]*credentials: "same-origin"/);
  assert.doesNotMatch(page, /getSession|Authorization|authorizationHeaders/);
});
