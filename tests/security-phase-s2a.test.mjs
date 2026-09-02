import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server.js";
import {
  PRIVATE_CACHE_HEADERS,
  buildPrivateLoginPath,
  isPrivateRoute,
} from "../app/lib/security/private-routes.ts";
import { proxy } from "../proxy.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("private route inventory includes direct and nested authenticated pages", () => {
  for (const path of [
    "/today",
    "/pets",
    "/pets/00000000-0000-4000-8000-000000000001",
    "/history",
    "/ask",
    "/products",
    "/care-log",
    "/vet-brief",
    "/vet-briefs/00000000-0000-4000-8000-000000000001",
    "/dogs/00000000-0000-4000-8000-000000000001/memories",
    "/account",
    "/onboarding",
  ]) assert.equal(isPrivateRoute(path), true, path);

  for (const path of ["/", "/login", "/forgot-password", "/update-password", "/privacy", "/terms"])
    assert.equal(isPrivateRoute(path), false, path);
});

test("private login redirects retain only the requested internal path", () => {
  assert.equal(buildPrivateLoginPath("/pets", "?tab=history"), "/login?next=%2Fpets%3Ftab%3Dhistory");
  assert.equal(buildPrivateLoginPath("/ask"), "/login?next=%2Fask");
});

test("unauthenticated direct private requests redirect before rendering and are not cacheable", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await proxy(new NextRequest("https://furvise.test/pets?tab=history"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://furvise.test/login?next=%2Fpets%3Ftab%3Dhistory");
    Object.entries(PRIVATE_CACHE_HEADERS).forEach(([name, value]) => {
      assert.equal(response.headers.get(name), value);
    });
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test("malformed or expired-looking auth cookies fail closed without reaching rendering", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  try {
    const request = new NextRequest("https://furvise.test/pets", {
      headers: { cookie: "sb-example-auth-token=base64-invalid" },
    });
    const response = await proxy(request);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://furvise.test/login?next=%2Fpets");
    assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test("Next.js proxy runs for pages but leaves route handlers to their own authentication", () => {
  const source = read("proxy.ts");
  assert.match(source, /export async function proxy/);
  assert.match(source, /\(\?!api\|_next\/static\|_next\/image/);
  assert.doesNotMatch(source, /\(\?!auth/);
});

test("proxy refreshes cookie sessions with verified claims and private cache headers", () => {
  const source = read("app/lib/supabase/proxy.ts");
  assert.match(source, /createServerClient/);
  assert.match(source, /supabase\.auth\.getClaims\(\)/);
  assert.doesNotMatch(source, /auth\.getSession\(\)/);
  assert.match(source, /request\.cookies\.set/);
  assert.match(source, /response\.cookies\.set/);
  assert.match(source, /applyPrivateCacheHeaders\(response\.headers\)/);
});

test("authenticated layouts verify a current user and opt out of prerendering", () => {
  const privateLayout = read("app/components/private-route-layout.tsx");
  assert.match(privateLayout, /createServerSupabase/);
  assert.match(privateLayout, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(privateLayout, /getSession/);
  assert.doesNotMatch(privateLayout, /\.from\(|\.insert\(|\.update\(|\.delete\(/);

  for (const path of [
    "app/account/layout.tsx",
    "app/ask/layout.tsx",
    "app/care-log/layout.tsx",
    "app/dashboard/layout.tsx",
    "app/dogs/layout.tsx",
    "app/onboarding/layout.tsx",
    "app/pets/layout.tsx",
    "app/results/layout.tsx",
    "app/shop/layout.tsx",
    "app/today/layout.tsx",
    "app/vet-brief/layout.tsx",
    "app/vet-briefs/layout.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /dynamic = "force-dynamic"/, path);
    assert.match(source, /PrivateRouteLayout/, path);
  }
});

test("login and recovery remain public while SSR auth uses cookies rather than token storage", () => {
  for (const path of ["app/login/layout.tsx", "app/forgot-password/layout.tsx", "app/update-password/layout.tsx"])
    assert.doesNotMatch(read(path), /PrivateRouteLayout/, path);

  const browserClient = read("app/lib/supabase.ts");
  assert.match(browserClient, /createBrowserClient/);
  assert.match(browserClient, /cookies: \{/);
  assert.doesNotMatch(browserClient, /storage: createBrowserAuthStorage/);
});

test("OAuth callback exchanges PKCE code on the server and validates redirects", () => {
  const callback = read("app/auth/callback/route.ts");
  const routing = read("app/lib/auth-routing.ts");
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /supabase\.auth\.getUser\(\)/);
  assert.match(callback, /resolvePostGoogleAuthDestination/);
  assert.match(callback, /applyPrivateCacheHeaders/);
  assert.match(routing, /parsed\.origin !== LOCAL_ORIGIN/);
});

test("restored private pages revalidate after logout instead of trusting bfcache state", () => {
  const authSession = read("app/lib/auth-session.ts");
  const header = read("app/components/signed-in-header.tsx");
  const signOut = read("app/lib/sign-out.ts");
  assert.match(authSession, /window\.addEventListener\("pageshow", revalidateRestoredPage\)/);
  assert.match(authSession, /event\.persisted/);
  assert.match(authSession, /client\.auth\.getUser\(\)/);
  assert.match(header, /signOutOfFurvise\(client\)/);
  assert.match(signOut, /client\.auth\.signOut\(\)/);
  assert.match(signOut, /clearAskClientState\(window\.(?:localStorage|sessionStorage)\)/);
  assert.match(header, /window\.location\.replace\("\/"\)/);
});
