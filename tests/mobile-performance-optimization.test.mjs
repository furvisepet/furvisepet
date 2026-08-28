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
  assert.doesNotMatch(login, /supportingText="Sign in to pick up where you left off\."/);
  assert.doesNotMatch(login, /<Suspense fallback=\{null\}>/);
});

test("the eager compact brand mark uses responsive approved vector assets", () => {
  const namedMark = brand.slice(brand.indexOf("if (showName)"), brand.lastIndexOf("\n  return ("));
  const iconOnlyMark = brand.slice(brand.lastIndexOf("\n  return ("));
  assert.match(brand, /FURVISE_BRAND_ASSET = "\/brand\/furvise-logo\.svg"/);
  assert.match(brand, /FURVISE_WORDMARK_ASSET = "\/brand\/furvise-wordmark\.svg"/);
  assert.match(brand, /FURVISE_MASCOT_ASSET = "\/brand\/furvise-heron\.svg"/);
  assert.ok(namedMark.indexOf("src={FURVISE_WORDMARK_ASSET}") < namedMark.indexOf("src={FURVISE_MASCOT_ASSET}"));
  assert.match(namedMark, /columnGap: "6px"/);
  assert.match(namedMark, /width: `calc\(\$\{responsiveSize\} \* 4\)`/);
  assert.match(namedMark, /src=\{FURVISE_WORDMARK_ASSET\}[\s\S]*objectFit: "contain"/);
  assert.match(namedMark, /src=\{FURVISE_MASCOT_ASSET\}[\s\S]*objectFit: "contain"/);
  assert.match(iconOnlyMark, /height: responsiveSize[\s\S]*src=\{FURVISE_MASCOT_ASSET\}[\s\S]*width: responsiveSize/);
  assert.doesNotMatch(brand, /\.(?:png|jpe?g|webp)\b/i);
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
  assert.match(header, /<span className="relative h-full w-full">/);
  assert.match(header, /<span className={`inline-flex[^`]*overflow-hidden[^`]*rounded-\[var\(--radius-pill\)\][^`]*h-(?:8|10) w-(?:10|12)/);
  assert.match(header, /<Image[\s\S]*className="object-contain"[\s\S]*decoding="async"[\s\S]*fill[\s\S]*loading="lazy"[\s\S]*sizes="100%"/);
  assert.doesNotMatch(header, /className="object-cover"|className=".*object-scale-down"/);
  assert.doesNotMatch(header, /style=\{\{[^}]*filter:|transform:\s*.+filter|filter:\s*[\w-]+;/);
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
  assert.match(nextConfig, /"\/brand\/furvise-logo\.svg"[\s\S]*headers: \[\.\.\.immutableAssetHeaders\]/);
  assert.match(nextConfig, /source: "\/api\/:path\*"[\s\S]*private, no-cache, no-store/);
  assert.match(dashboardLayout, /export const dynamic = "force-dynamic"/);
});
