import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");
const accountAccess = read("app/components/account-access.tsx");
const css = read("app/globals.css");
const liquidGlassHook = read("app/lib/navigation/use-mobile-liquid-glass.ts");
const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const liquidGlassNotice = read("app/lib/vendor/liquidglass/README.md");
const liquidGlassRuntime = read("app/lib/vendor/liquidglass/index.js");

test("desktop primary navigation is text-only without changing its inventory or states", () => {
  const inventory = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  const desktop = header.slice(header.indexOf('<nav aria-label="Primary navigation"'), header.indexOf('data-ui="desktop-account-zone"'));
  for (const [href, label] of [["/dashboard", "Today"], ["/pets", "Pets"], ["/care-log", "History"], ["/ask", "Ask"], ["/shop", "Products"]]) {
    assert.match(inventory, new RegExp('href: "' + href + '", label: "' + label + '"'));
  }
  assert.doesNotMatch(inventory + "\n" + desktop, /NavigationIcon|<Image|asset:/);
  assert.match(desktop, /aria-current=\{isActive\(item\.href\) \? "page" : undefined\}/);
  assert.match(desktop, /focus-visible:ring-2/);
});

test("main and every shared auth header use the larger undistorted BrandMark sizing", () => {
  assert.match(header, /\[--brand-mark-size:2rem\] lg:\[--brand-mark-size:3\.125rem\]/);
  assert.match(header, /lg:min-h-\[4\.25rem\]/);
  assert.match(accountAccess, /\[--brand-mark-size:2\.5rem\]/);
  assert.match(accountAccess, /<BrandMark priority size=\{40\} \/>/);
  for (const page of ["app/login/page.tsx", "app/forgot-password/page.tsx", "app/reset-password/confirm/page.tsx", "app/update-password/page.tsx"]) {
    assert.match(read(page), /AccountAccessLayout/);
  }
  assert.match(read("app/login/page.tsx"), /mode === "signup"/);
  assert.match(read("app/components/brand-mark.tsx"), /objectFit: "contain"/);
});

test("mobile keeps five dock icons above LiquidGlass and More in the header", () => {
  const mobileStart = header.indexOf('<nav aria-label="Mobile navigation"');
  const mobile = header.slice(mobileStart, header.indexOf("</nav>", mobileStart) + 6);
  assert.match(mobile, /<NavigationIcon asset=\{item\.asset\} eager \/>/);
  assert.doesNotMatch(mobile, /NAVIGATION_ICON_ASSETS\.more/);
  assert.match(header.slice(0, header.indexOf('<nav aria-label="Mobile navigation"')), /<NavigationIcon asset=\{NAVIGATION_ICON_ASSETS\.more\} eager \/>/);
  assert.match(mobile, /mobile-liquid-glass-root/);
  assert.match(mobile, /mobile-liquid-glass-scene/);
  assert.match(mobile, /ref=\{mobileGlassRootRef\}/);
  assert.match(mobile, /ref=\{mobileGlassRef\}/);
  assert.match(mobile, /grid-cols-5/);
  assert.match(mobile, /data-liquid-glass-ignore=""[\s\S]*<NavigationIcon/);
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*linear-gradient[\s\S]*box-shadow:[\s\S]*backdrop-filter: blur\(24px\) saturate\(155%\)/);
  assert.match(css, /\.mobile-liquid-glass \{[\s\S]*background: transparent/);
});

test("the exact reviewed LiquidGlass release is vendored and lazy initialized only on capable mobile browsers", () => {
  assert.equal(packageJson.dependencies["@ybouane/liquidglass"], undefined);
  assert.equal(packageLock.packages["node_modules/@ybouane/liquidglass"], undefined);
  assert.match(liquidGlassNotice, /@ybouane\/liquidglass` version `1\.0\.3`/);
  assert.match(liquidGlassNotice, /License declared by upstream package metadata: MIT/);
  assert.match(liquidGlassNotice, /sha512-Ro\/Q3va/);
  assert.match(liquidGlassHook, /await import\("\.\.\/vendor\/liquidglass\/index\.js"\)/);
  assert.match(liquidGlassHook, /LiquidGlass\.init\(\{[\s\S]*root,[\s\S]*glassElements: \[glass\]/);
  assert.match(liquidGlassHook, /const MOBILE_MEDIA_QUERY = "\(max-width: 1023px\)"/);
  assert.match(liquidGlassHook, /mobileQuery\.matches[\s\S]*\? readSupport\(\)/);
  assert.match(liquidGlassHook, /document\.visibilityState === "visible"/);
  assert.doesNotMatch(header, /@ybouane\/liquidglass|LiquidGlass\.init/);
});

test("SSR, reduced motion, unsupported platforms, and initialization errors retain the CSS fallback", () => {
  const beforeEffect = liquidGlassHook.slice(0, liquidGlassHook.indexOf("useEffect(() =>"));
  assert.doesNotMatch(beforeEffect, /inspectLiquidGlassSupport\(\);|import\("\.\.\/vendor\/liquidglass\/index\.js"\)/);
  assert.match(liquidGlassHook, /useEffect\(\(\) => \{[\s\S]*inspectLiquidGlassSupport\(\)/);
  assert.match(liquidGlassHook, /REDUCED_MOTION_QUERY = "\(prefers-reduced-motion: reduce\)"/);
  assert.match(liquidGlassHook, /CSS\.supports\("backdrop-filter"/);
  assert.match(liquidGlassHook, /webglCanvas\.getContext\("webgl"\)/);
  assert.match(liquidGlassHook, /root\.dataset\.liquidGlassState = "fallback"/);
  assert.match(liquidGlassHook, /catch \{[\s\S]*root\.dataset\.liquidGlassState = "fallback"/);
  assert.match(liquidGlassRuntime, /catch \(error\) \{[\s\S]*instance\.destroy\(\);[\s\S]*throw error;/);
  assert.doesNotMatch(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.mobile-liquid-glass-scene \{ display: none; \}/);
});
