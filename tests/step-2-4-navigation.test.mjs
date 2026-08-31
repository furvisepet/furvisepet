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
  assert.match(header, /homepage-wide-shell homepage-header-grid/);
  assert.match(header, /homepage-header-brand-zone" data-ui="desktop-brand-zone"/);
  assert.match(header, /homepage-header-navigation-zone" data-ui="desktop-navigation-zone"/);
  assert.match(header, /homepage-header-actions" data-ui="desktop-account-zone"/);
  assert.match(header, /className="homepage-full-logo"[\s\S]*src="\/brand\/furvise-logo\.svg"/);
  assert.match(header, /data-ui="desktop-account-container"/);
  assert.match(header, /aria-label="Open account menu" className=\{`homepage-header-text-link/);
  assert.doesNotMatch(header, /(?:ml|mr|translate-x)-\[/);
});

test("desktop routes use the homepage text rail and quiet selected state", () => {
  const desktop = header.slice(header.indexOf('<nav aria-label="Primary navigation"'), header.indexOf('data-ui="desktop-account-zone"'));
  assert.match(desktop, /className="homepage-desktop-navigation"[\s\S]*data-ui="desktop-navigation-container"/);
  assert.match(desktop, /homepage-header-text-link app-header-navigation-link/);
  assert.match(desktop, /data-active-indicator=\{isActive\(item\.href\) \? "underline"/);
  assert.doesNotMatch(desktop, /surface-raised|soft-sage|rounded-\[var\(--radius-md\)\]/);
  assert.doesNotMatch(desktop, /NavigationIcon|<Image|asset:/);
});

test("mobile dock has the exact icon and label destinations with a selected state", () => {
  const mobileItems = header.slice(header.indexOf("const MOBILE_NAV_ITEMS"), header.indexOf("export function AppHeader"));
  let cursor = -1;
  for (const [label, icon] of [["Today", "today"], ["History", "history"], ["Ask", "ask"], ["Pets", "pets"], ["Account", "more"]]) {
    const next = mobileItems.indexOf(`icon: "${icon}", label: "${label}"`);
    assert.ok(next > cursor, `${label} retains its required order and icon`);
    cursor = next;
  }
  assert.match(header, /asset=\{NAVIGATION_ICON_ASSETS\.more\}/);
  assert.match(header, /flex min-h-11[\s\S]*flex-col[\s\S]*<NavigationIcon asset=\{item\.asset\} \/>[\s\S]*\{item\.label\}<\/span>/);
  assert.match(header, /data-active-indicator=\{active \? "icon-capsule"/);
  assert.match(header, /active \? "bg-\[var\(--selected-navigation-background\)\]"/);
});

test("mobile navigation is a translucent semantic floating dock with no logo or orange", () => {
  const mobileNav = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  assert.match(mobileNav, /mx-4 mb-2 grid[\s\S]*grid-cols-5[\s\S]*askCompactNavigation \? "h-\[var\(--mobile-nav-compact-height\)\] p-1" : "h-\[var\(--mobile-nav-expanded-height\)\] p-1\.5"/);
  assert.match(mobileNav, /mobile-liquid-glass[\s\S]*rounded-\[var\(--radius-xl\)\]/);
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*linear-gradient[\s\S]*backdrop-filter: blur\(24px\) saturate\(155%\)/);
  assert.doesNotMatch(mobileNav, /BrandMark|furvise-logo|action-primary|orange/i);
});

test("More routes, aria state, safe area, and shared clearance remain intact", () => {
  assert.match(header, /aria-current=\{isActive\(item\.href\) \? "page" : undefined\}/);
  assert.match(header, /pb-\[var\(--mobile-nav-safe-area\)\]/);
  assert.doesNotMatch(header, /href="\/shop"[\s\S]*>Products<\/Link>/);
  assert.match(header, /accountMenuItems\.map[\s\S]*href=\{item\.href\}/);
  assert.match(css, /--mobile-nav-height: 4\.25rem;[\s\S]*--mobile-nav-safe-area:[\s\S]*--mobile-nav-clearance:/);
  assert.match(appPage, /app-mobile-nav-clearance/);
});

test("approved brand asset remains byte-identical", () => {
  const brand = read("app/components/brand-mark.tsx");
  assert.match(header, /className="homepage-full-logo"[\s\S]*src="\/brand\/furvise-logo\.svg"/);
  assert.match(brand, /objectFit: "contain"/);
  assert.match(brand, /height: "100%"/);
  assert.doesNotMatch(brand, /translateY|scale\(2\.75\)/);
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103E452559F4F29B0492A6731782ECD680992F62798BE95DDC7ABA544F3B00");
});
