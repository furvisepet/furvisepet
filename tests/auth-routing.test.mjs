import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NEW_PET_LOGIN_PATH,
  NEW_PET_ONBOARDING_PATH,
  buildLoginHref,
  getSafeNextPath,
  pointsToNewPetOnboarding,
} from "../app/lib/auth-routing.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("signed-out Add pet links target login with next onboarding", () => {
  assert.equal(NEW_PET_ONBOARDING_PATH, "/onboarding?mode=new");
  assert.equal(NEW_PET_LOGIN_PATH, "/login?next=%2Fonboarding%3Fmode%3Dnew");
  assert.equal(buildLoginHref(NEW_PET_ONBOARDING_PATH), NEW_PET_LOGIN_PATH);

  const homepage = read("app/components/homepage-client.tsx");
  assert.match(homepage, /const addPetHref = authState === "authenticated" \? NEW_PET_ONBOARDING_PATH : NEW_PET_LOGIN_PATH;/);
  assert.match(homepage, /href=\{addPetHref\}/);
  assert.match(homepage, /if \(authState !== "authenticated"\) \{\s*return;\s*\}/);
});

test("signed-in Add pet actions go directly to new-pet onboarding", () => {
  for (const path of [
    "app/dashboard/page.tsx",
    "app/pets/page.tsx",
    "app/components/care-log-workspace.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /NEW_PET_ONBOARDING_PATH/);
    assert.doesNotMatch(source, /href="\/onboarding/);
  }
});

test("signed-out direct onboarding redirects to login with next before restoring draft storage", () => {
  const source = read("app/onboarding/page.tsx");
  const authGuardStart = source.indexOf("useConfirmedSupabaseAuth()");
  const draftRestoreStart = source.indexOf("window.localStorage.getItem(ONBOARDING_MODE_STORAGE_KEY)");

  assert.ok(authGuardStart >= 0);
  assert.ok(draftRestoreStart > authGuardStart);
  assert.match(source, /if \(authStatus !== "signedOut"\) return;/);
  assert.match(source, /router\.replace\(buildLoginHref\(nextPath\)\);/);
  assert.match(source, /const nextPath = currentPath === "\/onboarding" \? NEW_PET_ONBOARDING_PATH : currentPath;/);
});

test("login next handling rejects external URLs and allows internal onboarding", () => {
  assert.equal(getSafeNextPath("/onboarding?mode=new", "/dashboard"), "/onboarding?mode=new");
  assert.equal(getSafeNextPath("https://evil.example/onboarding?mode=new", "/dashboard"), "/dashboard");
  assert.equal(getSafeNextPath("//evil.example/onboarding?mode=new", "/dashboard"), "/dashboard");
  assert.equal(getSafeNextPath("javascript:alert(1)", "/dashboard"), "/dashboard");
  assert.equal(pointsToNewPetOnboarding("/onboarding?mode=new"), true);
  assert.equal(pointsToNewPetOnboarding("/onboarding?mode=edit"), false);
});

test("login redirects to next after successful auth", () => {
  const source = read("app/login/page.tsx");

  assert.match(source, /const nextPath = getSafeNextPath\(searchParams\.get\("next"\) \|\| searchParams\.get\("returnTo"\), "\/dashboard"\);/);
  assert.match(source, /if \(authStatus !== "signedIn"\) return;/);
  assert.match(source, /router\.replace\(nextPath\);/);
  assert.match(source, /pointsToNewPetOnboarding\(nextPath\)/);
  assert.match(source, /Sign in to save your pet's care history\./);
});

test("signed-out login with onboarding next keeps the form tree stable", () => {
  const source = read("app/login/page.tsx");

  assert.match(source, /const authChecked = authStatus !== "loading";/);
  assert.match(source, /<form className="grid gap-4" onSubmit=\{submitAuth\}>/);
  assert.match(source, /<StatusBanner text="Checking your session\.\.\." \/>/);
  assert.match(source, /disabled=\{!authChecked \|\| loading \|\| Boolean\(configError\)\}/);
  assert.doesNotMatch(source, /!authChecked \? \(\s*<div className="space-y-5">/);
  assert.doesNotMatch(source, /Checking your account\.\.\./);
  assert.doesNotMatch(source, /h-3 w-28 rounded-full bg-\[var\(--pw-card-muted\)\]/);
});

test("login and onboarding use confirmed auth state instead of competing cached session checks", () => {
  const login = read("app/login/page.tsx");
  const onboarding = read("app/onboarding/page.tsx");
  const authSession = read("app/lib/auth-session.ts");
  const onboardingRedirectGuard = onboarding.slice(
    onboarding.indexOf('if (didRedirectRef.current) return;'),
    onboarding.indexOf('useEffect(() => {', onboarding.indexOf('if (authStatus !== "signedIn")')),
  );

  assert.match(login, /useConfirmedSupabaseAuth\(\)/);
  assert.match(onboarding, /useConfirmedSupabaseAuth\(\)/);
  assert.doesNotMatch(login, /onAuthStateChange/);
  assert.doesNotMatch(onboardingRedirectGuard, /getCurrentUser\(\)\s*\.then/);
  assert.match(authSession, /status: "loading"/);
  assert.match(authSession, /client\.auth\s*\.getUser\(\)/);
  assert.match(authSession, /if \(!initialCheckComplete\) \{\s*return;\s*\}/);
  assert.match(authSession, /event === "SIGNED_IN"/);
});

test("auth loading state does not redirect between login and onboarding", () => {
  const login = read("app/login/page.tsx");
  const onboarding = read("app/onboarding/page.tsx");

  assert.match(login, /if \(authStatus !== "signedIn"\) return;[\s\S]*router\.replace\(nextPath\);/);
  assert.match(onboarding, /if \(authStatus !== "signedOut"\) return;[\s\S]*router\.replace\(buildLoginHref\(nextPath\)\);/);
  assert.doesNotMatch(login, /authStatus === "loading"[\s\S]*router\.replace/);
  assert.doesNotMatch(onboarding, /authStatus === "loading"[\s\S]*router\.replace/);
});

test("protected pages redirect signed-out users to login with current path next", () => {
  const authSession = read("app/lib/auth-session.ts");
  assert.match(authSession, /export function useRequireConfirmedSupabaseAuth\(\)/);
  assert.match(authSession, /if \(authState\.status !== "signedOut"\) return;/);
  assert.match(authSession, /const nextPath = `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`;/);
  assert.match(authSession, /router\.replace\(buildLoginHref\(nextPath\)\);/);

  for (const path of [
    "app/dashboard/page.tsx",
    "app/ask/page.tsx",
    "app/components/care-log-workspace.tsx",
    "app/pets/page.tsx",
    "app/pets/[id]/page.tsx",
    "app/shop/page.tsx",
    "app/account/page.tsx",
    "app/dogs/[id]/memories/page.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /useRequireConfirmedSupabaseAuth\(\)/, path);
    assert.match(source, /authStatus !== "signedIn"/, path);
  }
});

test("protected page loading paths no longer render signed-out error copy", () => {
  for (const path of [
    "app/dashboard/page.tsx",
    "app/ask/page.tsx",
    "app/components/care-log-workspace.tsx",
    "app/pets/page.tsx",
    "app/pets/[id]/page.tsx",
    "app/shop/page.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /Please sign in to (open|ask|view)/, path);
  }
});

test("signed-in onboarding restores and renders instead of redirecting to login", () => {
  const source = read("app/onboarding/page.tsx");

  assert.match(source, /if \(authStatus !== "signedIn"\) \{\s*return;\s*\}/);
  assert.match(source, /setIsRestored\(true\);/);
  assert.match(source, /<StepInput/);
});

test("redirect guards fire once to prevent login onboarding ping-pong", () => {
  const login = read("app/login/page.tsx");
  const onboarding = read("app/onboarding/page.tsx");

  assert.match(login, /const didRedirectRef = useRef\(false\);/);
  assert.match(login, /if \(didRedirectRef\.current\) return;[\s\S]*didRedirectRef\.current = true;[\s\S]*router\.replace\(nextPath\);/);
  assert.match(onboarding, /const didRedirectRef = useRef\(false\);/);
  assert.match(onboarding, /if \(didRedirectRef\.current\) return;[\s\S]*didRedirectRef\.current = true;[\s\S]*router\.replace\(buildLoginHref\(nextPath\)\);/);
});

test("Results does not show unsigned local draft results", () => {
  const source = read("app/results/page.tsx");
  const noProfileBranch = source.slice(
    source.indexOf("const user = await getCurrentUser();"),
    source.indexOf("const stored = window.localStorage.getItem(STORAGE_KEY);"),
  );

  assert.match(noProfileBranch, /if \(!user\) \{/);
  assert.match(noProfileBranch, /router\.replace\(NEW_PET_LOGIN_PATH\);/);
  assert.match(noProfileBranch, /return;/);
});

test("signed-out Shop redirects preserve current path and safe query string", () => {
  const shop = read("app/shop/page.tsx");
  const authSession = read("app/lib/auth-session.ts");

  assert.match(shop, /useRequireConfirmedSupabaseAuth\(\)/);
  assert.match(shop, /authStatus !== "signedIn"/);
  assert.match(authSession, /const nextPath = `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`;/);
  assert.equal(buildLoginHref("/shop"), "/login?next=%2Fshop");
  assert.equal(buildLoginHref("/shop?petId=abc"), "/login?next=%2Fshop%3FpetId%3Dabc");
  assert.equal(getSafeNextPath("/shop?petId=abc", "/dashboard"), "/shop?petId=abc");
  assert.equal(getSafeNextPath("https://evil.example/shop?petId=abc", "/dashboard"), "/dashboard");
});
