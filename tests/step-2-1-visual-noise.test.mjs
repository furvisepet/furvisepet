import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const primitives = read("app/components/product-primitives.tsx");
const overflow = read("app/components/pet-overflow-menu.tsx");
const pets = read("app/pets/page.tsx");
const ask = read("app/ask/page.tsx");
const history = read("app/components/care-log-workspace.tsx");
const homepage = read("app/components/homepage-client.tsx");
const appPage = read("app/components/app-page.tsx");
const css = read("app/globals.css");
const config = read("next.config.ts");
const brand = read("app/components/brand-mark.tsx");
const visualQa = read("docs/visual-qa-checklist.md");

test("all four shared button variants keep visible labels and explicit foregrounds", () => {
  const expectedForegrounds = {
    primary: "text-[var(--text-inverse)]",
    secondary: "text-[var(--secondary-action-text)]",
    soft: "text-[var(--soft-action-text)]",
    ghost: "text-[var(--ghost-action-text)]",
  };

  for (const [variant, foreground] of Object.entries(expectedForegrounds)) {
    assert.match(primitives, new RegExp(`${variant}: "[^"]*${foreground.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(primitives, new RegExp(`function ${variant[0].toUpperCase()}${variant.slice(1)}Button\\(props: ButtonProps\\)[\\s\\S]*variant="${variant}"`));
  }

  assert.match(primitives, /data-button-label/);
  assert.match(primitives, /buttonLabelVariantClasses\[variant\]/);
  assert.match(primitives, /group-disabled:text-\[color:var\(--disabled-text\)\]/);
  assert.match(primitives, /data-button-variant=\{variant\}/);
  assert.doesNotMatch(primitives, /<button\b[^>]*>\s*<\/button>/);
});

test("enabled and disabled shared buttons use separate readable state contracts", () => {
  assert.match(primitives, /disabled:bg-\[var\(--disabled-surface\)\] disabled:text-\[var\(--disabled-text\)\]/);
  assert.match(primitives, /aria-disabled:bg-\[var\(--disabled-surface\)\] aria-disabled:text-\[var\(--disabled-text\)\]/);
  assert.match(primitives, /const unavailable = Boolean\(buttonProps\.disabled \|\| loading\)/);
  assert.match(primitives, /disabled=\{unavailable\}/);
  assert.match(primitives, /onClick=\{unavailable \? \(event\) => event\.preventDefault\(\) : undefined\}/);
  assert.doesNotMatch(Object.values({
    primary: "text-inverse",
    secondary: "secondary-action-text",
    soft: "soft-action-text",
    ghost: "ghost-action-text",
  }).join(" "), /disabled-text/);
  assert.match(css, /--disabled-text: var\(--disabled-foreground\)/);
});

test("meaningless decorative dots and empty marker containers are removed", () => {
  assert.doesNotMatch(primitives, /IconContainer className="mb-5"[\s\S]*h-2\.5 w-2\.5 rounded-full/);
  assert.doesNotMatch(ask, /h-2 w-2 rounded-full bg-\[var\(--pw-primary\)\]/);
  assert.doesNotMatch(history, /empty-history-title[\s\S]{0,500}h-2\.5 w-2\.5 rounded-full/);
  assert.doesNotMatch(homepage, /mb-5 block h-2\.5 w-10 rounded-full/);
});

test("pet overflow trigger and compact menu implement the accessible interaction contract", () => {
  assert.match(pets, /<PetOverflowMenu[^>]*name=\{name\}/);
  assert.doesNotMatch(pets, />More<span|<summary/);
  assert.match(overflow, /aria-label=\{`More actions for \$\{name\}`\}/);
  assert.match(overflow, /aria-controls=\{open \? menuId : undefined\}/);
  assert.match(overflow, /className="inline-flex h-11 w-11/);
  assert.match(overflow, /<OverflowMenuIcon \/>/);
  assert.match(overflow, /role="menu"/);
  assert.match(overflow, /Edit profile[\s\S]*Remembered details[\s\S]*role="separator"[\s\S]*Delete profile/);
  assert.match(overflow, /text-\[var\(--danger-text\)\]/);
  assert.match(overflow, /event\.key !== "Escape"[\s\S]*closeMenu\(true\)/);
  assert.match(overflow, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(overflow, /onClick=\{\(\) => closeMenu\(\)\}/);
  assert.match(overflow, /ArrowDown[\s\S]*ArrowUp[\s\S]*Home[\s\S]*End/);
  assert.match(overflow, /window\.innerWidth[\s\S]*window\.innerHeight/);
  assert.match(overflow, /createPortal\(menu, document\.body\)/);
});

test("fixed mobile navigation has safe-area-aware content clearance", () => {
  assert.match(appPage, /app-mobile-nav-clearance/);
  assert.match(homepage, /mode === "no-pets" \|\| mode === "with-pet" \? "app-mobile-nav-clearance"/);
  assert.match(ask, /app-sticky-composer sticky \$\{hasThread \? "lg:sticky" : "lg:relative"\}/);
  assert.match(css, /--mobile-nav-height: 4\.25rem/);
  assert.match(css, /--mobile-nav-safe-area: env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /\.app-mobile-nav-clearance[\s\S]*--mobile-nav-clearance/);
  assert.match(css, /\.app-sticky-composer[\s\S]*--mobile-nav-height[\s\S]*--mobile-nav-safe-area/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*\.app-mobile-nav-clearance[\s\S]*padding-bottom: var\(--space-12\)/);
});

test("the bottom-left N is the disabled Next development indicator, not Furvise UI", () => {
  assert.match(config, /devIndicators: false/);
  assert.match(visualQa, /development route indicator[\s\S]*devIndicators: false[\s\S]*screenshot QA/);
  const furviseSources = [primitives, overflow, pets, ask, history, homepage, appPage].join("\n");
  assert.doesNotMatch(furviseSources, /fixed[^\n]*(?:bottom[^\n]*left|left[^\n]*bottom)/);
});

test("approved branding preserves the canonical SVG source set", () => {
  assert.match(brand, /FURVISE_BRAND_ASSET = "\/brand\/furvise-logo\.svg"/);
  assert.deepEqual(readdirSync(new URL("../public/brand/", import.meta.url)).sort(), ["furvise-heron.svg", "furvise-logo.svg", "furvise-wordmark.svg"]);
});
