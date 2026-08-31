import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const css = read("app/globals.css");
const primitives = read("app/components/product-primitives.tsx");
const header = read("app/components/app-header.tsx");

test("Step 1 exposes semantic color, radius, spacing, elevation, and motion tokens", () => {
  for (const token of [
    "page-background", "surface-primary", "surface-raised", "surface-highlight",
    "text-primary", "text-secondary", "text-muted", "border-subtle", "border-strong",
    "primary-action", "primary-action-text", "secondary-action", "soft-action", "ghost-action-text",
    "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-pill",
    "space-1", "space-2", "space-3", "space-4", "space-5", "space-6", "space-8", "space-10", "space-12", "space-16",
    "shadow-surface-1", "shadow-surface-2", "shadow-floating", "motion-fast", "motion-standard",
  ]) assert.match(css, new RegExp(`--${token}:`), `${token} must be defined`);
  for (const accent of ["sage", "sky", "apricot", "lavender", "yellow"]) assert.match(css, new RegExp(`--accent-${accent}:`));
});

test("shared buttons expose exactly four variants with explicit readable foregrounds", () => {
  assert.match(primitives, /export type ButtonVariant = "primary" \| "secondary" \| "soft" \| "ghost"/);
  for (const variant of ["primary", "secondary", "soft", "ghost"]) assert.match(primitives, new RegExp(`${variant}: "`));
  assert.match(primitives, /primary: "bg-\[var\(--action-primary\)\] text-\[var\(--text-inverse\)\]/);
  assert.match(css, /--text-inverse: var\(--primary-action-foreground\)/);
  assert.match(primitives, /disabled:bg-\[var\(--disabled-surface\)\] disabled:text-\[var\(--disabled-text\)\]/);
  assert.match(primitives, /data-loading=\{loading \|\| undefined\}/);
});

test("shared cards provide all five tactile variants", () => {
  assert.match(primitives, /export type CardVariant = "standard" \| "interactive" \| "highlight" \| "pet" \| "empty"/);
  assert.match(primitives, /interactive: "cursor-pointer[\s\S]*hover:-translate-y-0\.5[\s\S]*active:translate-y-0/);
  assert.match(primitives, /data-card-variant=\{variant\}/);
});

test("inputs, chips, and navigation expose visible focus, selected, active, and disabled states", () => {
  assert.match(primitives, /fieldControlClass[\s\S]*focus:border-\[var\(--focus-ring\)\][\s\S]*disabled:text-\[var\(--disabled-text\)\]/);
  assert.match(primitives, /export type ChipVariant = "neutral" \| "selected" \| "category" \| "status" \| "removable"/);
  assert.match(primitives, /selected: "border-\[var\(--sage\)\] bg-\[var\(--chip-selected-background\)\] text-\[var\(--chip-selected-foreground\)\]/);
  assert.match(header, /aria-current=\{isActive\(item\.href\) \? "page" : undefined\}/);
  assert.match(header, /data-active-indicator=\{isActive\(item\.href\) \? "underline"/);
});

test("pet avatars support photos and a warm initial fallback", () => {
  assert.match(primitives, /export function PetAvatar/);
  assert.match(primitives, /photoUrl \? \([\s\S]*object-cover[\s\S]*name\.trim\(\)\.slice\(0, 1\)\.toUpperCase\(\)/);
  assert.match(primitives, /getPetAccent\(name\)/);
  assert.match(primitives, /shadow-\[var\(--shadow-surface-1\)\]/);
});

test("brand sources stay pinned to the existing logo and favicon paths", () => {
  assert.match(read("app/components/brand-mark.tsx"), /FURVISE_BRAND_ASSET = "\/brand\/furvise-logo\.svg"/);
  assert.match(read("app/layout.tsx"), /url: "\/favicon\.ico"/);
  for (const asset of [
    "app/favicon.ico", "public/brand/furvise-logo.svg", "public/brand/furvise-wordmark.svg", "public/brand/furvise-heron.svg",
  ]) {
    assert.equal(existsSync(path.join(root, asset)), true, `${asset} must exist`);
  }
});

test("the warm-light foundation avoids pure black and respects reduced motion", () => {
  assert.match(css, /--page-background: var\(--warm-canvas\)/);
  assert.doesNotMatch(css, /(?:#000000|#000)\b/i);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: 0\.01ms !important/);
});
