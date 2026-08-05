import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex").toUpperCase();
const header = read("app/components/app-header.tsx");
const css = read("app/globals.css");
const appPage = read("app/components/app-page.tsx");

test("desktop brand, routes, and Account share one optical alignment row", () => {
  assert.match(header, /data-ui="header-optical-row"/);
  assert.match(header, /lg:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(header, /lg:justify-self-start" data-ui="desktop-brand-zone"/);
  assert.match(header, /justify-self-center lg:flex" data-ui="desktop-navigation-zone"/);
  assert.match(header, /lg:justify-self-end" data-ui="desktop-account-zone"/);
  assert.match(header, /inline-flex items-center \[--brand-mark-size:2rem\][\s\S]*lg:\[--brand-mark-size:2\.55rem\]/);
  assert.match(header, /data-ui="desktop-account-container"/);
  assert.match(header, /aria-label="Open account menu" className="flex min-h-11/);
  assert.doesNotMatch(header, /(?:ml|mr|translate-x)-\[/);
});

test("desktop routes use one shared warm-neutral container and compact selected state", () => {
  const desktop = header.slice(header.indexOf('<nav aria-label="Primary navigation"'), header.indexOf('<div className="flex shrink-0 items-center gap-2">'));
  assert.match(desktop, /bg-\[var\(--surface-raised\)\][\s\S]*data-ui="desktop-navigation-container"/);
  assert.match(desktop, /flex min-h-11 items-center/);
  assert.match(desktop, /bg-\[color-mix\(in_srgb,var\(--soft-sage\)_88%,var\(--sage\)_12%\)\]/);
  assert.match(desktop, /shadow-\[inset_0_0_0_1px_var\(--sage\)\]/);
  assert.match(desktop, /bg-transparent font-medium text-\[var\(--deep-forest\)\]/);
  assert.match(desktop, /data-active-indicator=\{isActive\(item\.href\) \? "background"/);
});

test("mobile dock has the exact icon and label destinations with a selected state", () => {
  const mobileItems = header.slice(header.indexOf("const MOBILE_NAV_ITEMS"), header.indexOf("export function AppHeader"));
  let cursor = -1;
  for (const [label, icon] of [["Today", "today"], ["History", "history"], ["Ask", "ask"], ["Pets", "pets"]]) {
    const next = mobileItems.indexOf(`icon: "${icon}", label: "${label}"`);
    assert.ok(next > cursor, `${label} retains its required order and icon`);
    cursor = next;
  }
  assert.match(header, /asset=\{NAVIGATION_ICON_ASSETS\.more\}/);
  assert.match(header, /flex min-h-11[\s\S]*flex-col[\s\S]*<NavigationIcon asset=\{item\.asset\} eager \/>[\s\S]*\{item\.label\}<\/span>/);
  assert.match(header, /data-active-indicator=\{active \? "icon-capsule"/);
  assert.match(header, /active \? "bg-\[var\(--selected-navigation-background\)\]"/);
});

test("mobile navigation is a translucent semantic floating dock with no logo or orange", () => {
  const mobileNav = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  assert.match(mobileNav, /mx-4 mb-2 grid[\s\S]*h-\[var\(--mobile-nav-height\)\][\s\S]*h-\[var\(--mobile-nav-expanded-height\)\]/);
  assert.match(mobileNav, /rounded-\[var\(--radius-xl\)\][\s\S]*bg-\[color-mix\(in_srgb,var\(--navigation-background\)_65%,transparent\)\][\s\S]*backdrop-blur-\[22px\][\s\S]*backdrop-saturate-\[145%\]/);
  assert.doesNotMatch(mobileNav, /BrandMark|furvise-logo|action-primary|orange/i);
});

test("More routes, aria state, safe area, and shared clearance remain intact", () => {
  assert.match(header, /aria-current=\{isActive\(item\.href\) \? "page" : undefined\}/);
  assert.match(header, /pb-\[var\(--mobile-nav-safe-area\)\]/);
  assert.match(header, /href="\/shop"[\s\S]*>Products<\/Link>/);
  assert.match(header, /accountMenuItems\.map[\s\S]*href=\{item\.href\}/);
  assert.match(css, /--mobile-nav-height: 4\.25rem;[\s\S]*--mobile-nav-safe-area:[\s\S]*--mobile-nav-clearance:/);
  assert.match(appPage, /app-mobile-nav-clearance/);
});

test("approved brand asset remains byte-identical", () => {
  const brand = read("app/components/brand-mark.tsx");
  assert.match(header, /<BrandMark priority size=\{32\} \/>/);
  assert.match(brand, /objectFit: "contain"/);
  assert.match(brand, /height: "auto"/);
  assert.match(brand, /translateY\(calc\(\$\{responsiveSize\} \* 0\.117\)\) scale\(2\.75\)/);
  assert.equal(hash("public/brand/logo.png"), "D24A7A73878FB4692918D140D69DC9D803281D53FF2704AC51B5720A782BECB6");
});
