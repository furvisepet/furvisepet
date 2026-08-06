import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const homepage = read("app/components/homepage-client.tsx");
const login = read("app/login/page.tsx");
const brand = read("app/components/brand-mark.tsx");
const header = read("app/components/app-header.tsx");
const navigation = read("app/lib/navigation/mobile-navigation.ts");
const liquidGlass = read("app/lib/navigation/use-mobile-liquid-glass.ts");
const nextConfig = read("next.config.ts");
const dashboardLayout = read("app/dashboard/layout.tsx");

const optimizedNavigationAssets = [
  "/images/nav-today-v1.webp",
  "/images/nav-history-v1.webp",
  "/images/nav-ask-v1.webp",
  "/images/nav-pets-v1.webp",
  "/images/nav-products-v1.webp",
  "/images/nav-more-v1.webp",
];

test("the public LCP heading is server-prerendered instead of gated by auth loading", () => {
  assert.match(homepage, /const visibleMode[^=]*= mode === "loading" \? "anonymous" : mode/);
  assert.match(homepage, /<Hero activePet=\{activePet\} mode=\{visibleMode\}/);
  assert.match(homepage, /<h1[^>]*>Everything about your pet, in one caring place\.<\/h1>/);
  assert.doesNotMatch(homepage, /HomepageLoading|animate-pulse|mode === "loading" \? <Homepage/);
});

test("the login heading and logo have a non-blank server Suspense fallback", () => {
  assert.match(login, /<Suspense fallback=\{<LoginPageFallback \/>\}>/);
  assert.match(login, /function LoginPageFallback\(\)[\s\S]*title="Welcome back"/);
  assert.match(login, /supportingText="Sign in to continue caring for your pets\."/);
  assert.doesNotMatch(login, /<Suspense fallback=\{null\}>/);
});

test("the only eager above-the-fold image is the explicit optimized brand mark", () => {
  assert.match(brand, /FURVISE_BRAND_OPTIMIZED_ASSET = "\/brand\/logo-header-v1\.webp"/);
  assert.match(brand, /height=\{showName \? 159 : 1254\}[\s\S]*priority=\{priority\}[\s\S]*width=\{showName \? 512 : 1254\}/);
  assert.match(header, /<BrandMark priority size=\{32\} \/>/);
  assert.match(header, /function NavigationIcon[\s\S]*decoding="async"[\s\S]*loading="lazy"/);
  assert.doesNotMatch(header, /NavigationIcon[^\n]*priority|NavigationIcon[^\n]*eager/);
});

test("navigation uses small stable derivatives and never requests oversized source canvases", () => {
  for (const asset of optimizedNavigationAssets) {
    const url = new URL(`../public${asset}`, import.meta.url);
    assert.equal(existsSync(url), true, asset);
    assert.ok(statSync(url).size < 20_000, `${asset} should remain below 20 KB`);
    assert.equal((navigation.match(new RegExp(asset.replaceAll("/", "\\/").replace(".", "\\."), "g")) ?? []).length, 1);
  }
  for (const source of ["today_house.png", "history_clock.png", "ask_chat.png", "pets_paw.png", "pet_products.png", "more_dots.png"]) {
    assert.doesNotMatch(navigation, new RegExp(source.replace(".", "\\.")));
  }
  assert.match(header, /height=\{48\}[\s\S]*loading="lazy"[\s\S]*width=\{48\}/);
  assert.match(header, /className="h-full w-full object-contain"/);
  assert.match(header, /alt=""[\s\S]*aria-hidden="true"/);
});

test("LiquidGlass starts after load and idle without entering the server render path", () => {
  assert.match(liquidGlass, /document\.readyState === "complete"[\s\S]*beginDeferredInitialization\(\)/);
  assert.match(liquidGlass, /window\.addEventListener\("load", handleWindowLoad, \{ once: true \}\)/);
  assert.match(liquidGlass, /window\.requestIdleCallback\(start, \{ timeout: LIQUID_GLASS_IDLE_TIMEOUT_MS \}\)/);
  assert.match(liquidGlass, /initializationAllowed = true;[\s\S]*void synchronize\(\)/);
  assert.match(liquidGlass, /const currentSupport = mobileQuery\.matches/);
  const beforeEffect = liquidGlass.slice(0, liquidGlass.indexOf("useEffect(() =>"));
  assert.doesNotMatch(beforeEffect, /inspectLiquidGlassSupport\(\);|measuredSize\(glass\)|beginDeferredInitialization\(\)|import\("\.\.\/vendor\/liquidglass/);
});

test("optimized public assets are immutable while private pages and APIs stay private", () => {
  for (const asset of optimizedNavigationAssets) assert.match(nextConfig, new RegExp(`"${asset}"`));
  assert.match(nextConfig, /immutableAssetHeaders[\s\S]*public, max-age=31536000, immutable/);
  assert.match(nextConfig, /source: "\/brand\/logo-header-v1\.webp"[\s\S]*headers: \[\.\.\.immutableAssetHeaders\]/);
  assert.match(nextConfig, /source: "\/api\/:path\*"[\s\S]*private, no-cache, no-store/);
  assert.match(dashboardLayout, /export const dynamic = "force-dynamic"/);
});
