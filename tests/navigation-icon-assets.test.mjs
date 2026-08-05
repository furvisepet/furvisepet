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
  ];
  assert.deepEqual(
    MOBILE_NAVIGATION_ITEMS.map(({ asset, href, label }) => [label, href, asset]),
    expectedMobile,
  );

  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  assert.doesNotMatch(desktop, /asset:|NAVIGATION_ICON_ASSETS|<Image|NavigationIcon/);
  assert.match(header, /asset=\{NAVIGATION_ICON_ASSETS\.more\} eager/);
});

test("navigation images use bounded object-contain rendering without artwork-damaging effects", () => {
  assert.match(header, /import Image from "next\/image"/);
  assert.match(header, /asset === NAVIGATION_ICON_ASSETS\.more \? "scale-\[2\.65\]" : "scale-\[2\.35\]"/);
  assert.match(header, /className=\{`h-full w-full \$\{artworkScale\} object-contain`\}/);
  assert.match(header, /height=\{72\}/);
  assert.match(header, /width=\{48\}/);
  assert.match(header, /h-8 w-10" : "h-10 w-12"\}[^"]*overflow-hidden/);
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
  assert.match(header, /aria-label="Open More menu"/);
  assert.match(header, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(header, /focus-visible:ring-2/);
});

test("no superseded navigation artwork or inline navigation glyphs remain", () => {
  const navigation = `${read("app/lib/navigation/mobile-navigation.ts")}\n${header}`;
  assert.doesNotMatch(navigation, /\/images\/(?:cat|dog)\.png/);
  const mobileNavigation = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  assert.doesNotMatch(mobileNavigation, /<svg|<circle|fill="currentColor"/);
});
