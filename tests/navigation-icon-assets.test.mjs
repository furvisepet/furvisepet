import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  MOBILE_NAVIGATION_ITEMS,
  NAVIGATION_ICON_ASSETS,
} from "../app/lib/navigation/mobile-navigation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");

const expectedAssets = {
  ask: "/images/ask_chat.png",
  history: "/images/history_clock.png",
  more: "/images/more_dots.png",
  pets: "/images/pets_paw.png",
  products: "/images/pet_products.png",
  today: "/images/today_house.png",
};

test("the shared navigation icon inventory maps every action to its replacement PNG", () => {
  assert.deepEqual(NAVIGATION_ICON_ASSETS, expectedAssets);
  for (const asset of Object.values(expectedAssets)) {
    assert.equal(existsSync(new URL(`../public${asset}`, import.meta.url)), true, asset);
  }
});

test("mobile destinations retain the intended icon assets while desktop stays text-only", () => {
  const expectedMobile = [
    ["Today", "/today", expectedAssets.today],
    ["History", "/history", expectedAssets.history],
    ["Ask", "/ask", expectedAssets.ask],
    ["Pets", "/pets", expectedAssets.pets],
    ["Products", "/shop", expectedAssets.products],
  ];
  assert.deepEqual(
    MOBILE_NAVIGATION_ITEMS.map(({ asset, href, label }) => [label, href, asset]),
    expectedMobile,
  );

  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  assert.doesNotMatch(desktop, /asset:|NAVIGATION_ICON_ASSETS|<Image|NavigationIcon/);
  assert.match(header, /asset=\{NAVIGATION_ICON_ASSETS\.more\} eager/);
});

test("the mobile dock has exactly five evenly distributed routes in the required order", () => {
  assert.equal(MOBILE_NAVIGATION_ITEMS.length, 5);
  assert.deepEqual(MOBILE_NAVIGATION_ITEMS.map(({ label }) => label), ["Today", "History", "Ask", "Pets", "Products"]);
  const mobileStart = header.indexOf('<nav aria-label="Mobile navigation"');
  const mobile = header.slice(mobileStart, header.indexOf("</nav>", mobileStart) + 6);
  assert.match(mobile, /grid-cols-5/);
  assert.match(mobile, /MOBILE_NAV_ITEMS\.map/);
  assert.doesNotMatch(mobile, /NAVIGATION_ICON_ASSETS\.more|Open More menu/);
  assert.match(mobile, /mx-4[\s\S]*p-1\.5[\s\S]*px-1/);
  assert.match(mobile, /min-h-11/);
  assert.match(mobile, /whitespace-nowrap/);
});

test("Products has one canonical icon path and remains outside the LiquidGlass capture target", () => {
  const navigationSource = read("app/lib/navigation/mobile-navigation.ts");
  assert.equal((navigationSource.match(/\/images\/pet_products\.png/g) ?? []).length, 1);
  const mobile = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  const emptyGlassTarget = mobile.indexOf('data-liquid-glass-skip-content=""');
  const ignoredInteractiveLayer = mobile.indexOf('data-liquid-glass-ignore=""');
  const mappedIcons = mobile.indexOf("<NavigationIcon asset={item.asset}");
  assert.ok(emptyGlassTarget >= 0 && ignoredInteractiveLayer > emptyGlassTarget && mappedIcons > ignoredInteractiveLayer);
});

test("navigation images use bounded object-contain rendering without artwork-damaging effects", () => {
  assert.match(header, /import Image from "next\/image"/);
  assert.match(header, /asset === NAVIGATION_ICON_ASSETS\.more \? "scale-\[2\.65\]" : "scale-\[2\.35\]"/);
  assert.match(header, /className=\{`h-full w-full \$\{artworkScale\} object-contain`\}/);
  assert.match(header, /height=\{72\}/);
  assert.match(header, /width=\{48\}/);
  assert.match(header, /grid-cols-5/);
  assert.match(header, /min-h-11 min-w-0/);
  assert.match(header, /inline-flex h-10 w-12[^"]*overflow-hidden/);
  assert.match(header, /alt=""[\s\S]*aria-hidden="true"/);
  assert.doesNotMatch(header, /(?:filter|opacity|mask|object-cover)/);
});

test("navigation labels, destinations, state, and accessibility remain intact", () => {
  for (const [href, label] of [
    ["/dashboard", "Today"],
    ["/pets", "Pets"],
    ["/care-log", "History"],
    ["/ask", "Ask"],
    ["/shop", "Products"],
  ]) assert.match(header, new RegExp(`href: "${href}", label: "${label}"`));

  assert.match(header, /aria-label="Primary navigation"/);
  assert.match(header, /aria-label="Mobile navigation"/);
  assert.match(header, /aria-label=\{mobileMoreOpen \? "Close More menu" : "Open More menu"\}/);
  assert.match(header, /aria-expanded=\{mobileMoreOpen\}/);
  assert.match(header, /aria-controls=\{mobileMoreMenuId\}/);
  assert.match(header, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(header, /focus-visible:ring-2/);
});

test("no superseded navigation artwork or inline navigation glyphs remain", () => {
  const navigation = `${read("app/lib/navigation/mobile-navigation.ts")}\n${header}`;
  assert.doesNotMatch(navigation, /\/images\/(?:cat|dog)\.png/);
  const mobileNavigation = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  assert.doesNotMatch(mobileNavigation, /<svg|<circle|fill="currentColor"/);
});
