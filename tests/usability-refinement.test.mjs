import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const header = read("app/components/app-header.tsx");
const primitives = read("app/components/product-primitives.tsx");
const homepage = read("app/components/homepage-client.tsx");
const today = read("app/dashboard/page.tsx");
const pets = read("app/pets/page.tsx");
const history = read("app/components/care-log-workspace.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const vetBrief = read("app/vet-brief/page.tsx");
const globals = read("app/globals.css");

test("application navigation uses the reset route labels", () => {
  for (const label of ["Today", "Pets", "History", "Ask"]) {
    assert.match(header, new RegExp(`label: "${label}"`));
  }
  assert.match(header, /const MOBILE_NAV_ITEMS = \[[\s\S]*Today[\s\S]*History[\s\S]*Ask[\s\S]*Pets/);
  assert.doesNotMatch(header, /label: "Dashboard"|label: "Care history"|label: "Ask Furvise"/);
});

test("shared primitives cover the production interaction vocabulary", () => {
  for (const name of ["AppShell", "PageHeader", "Section", "Divider", "PrimaryButton", "SecondaryButton", "TextButton", "Field", "Select", "Dialog", "Drawer", "EmptyState", "Timeline", "PetIdentity", "Composer", "Notice", "ActionBar", "DocumentStatus", "LoadingState"]) {
    assert.match(primitives, new RegExp(`export function ${name}`));
  }
});

test("the color system exposes layered surfaces and centralized semantic roles", () => {
  for (const token of ["--surface-page", "--surface-primary", "--surface-raised", "--surface-interactive", "--surface-overlay", "--text-primary", "--text-secondary", "--action-primary", "--action-secondary", "--selection", "--focus"]) {
    assert.match(globals, new RegExp(token));
  }
  assert.match(globals, /:root \{[\s\S]*color-scheme: light/);
  assert.doesNotMatch(globals, /html\[data-theme|prefers-color-scheme/);
});

test("homepage uses the concise welcoming care story", () => {
  assert.match(homepage, /Everything about your pet, in one caring place\./);
  assert.match(homepage, /Takes about two minutes\./);
  for (const story of ["Remember what changed", "Ask when you are unsure", "Prepare for the vet"]) {
    assert.equal(homepage.split(story).length - 1, 1);
  }
  assert.doesNotMatch(homepage, />0[123]</);
  assert.match(homepage, /Ate normally after dinner[\s\S]*Paw licking looked better[\s\S]*Vet appointment/);
});

test("Today has one primary update moment and a quiet profile reminder", () => {
  assert.match(today, /<TodayGreeting \/>/);
  assert.match(today, /Anything worth remembering\?/);
  assert.match(today, /Make \{petName\}&apos;s guidance more specific/);
  assert.doesNotMatch(today, /Next best action|missing-field|Products for/);
});

test("Pets renders personal summaries instead of database labels", () => {
  assert.match(pets, /Care goal/);
  assert.match(pets, /Most recent update:/);
  assert.match(pets, /Open profile/);
  assert.match(pets, /Add update/);
  assert.doesNotMatch(pets, />Species<|Profile status|buildProfileStatus/);
});

test("History has compact filters and the intentional empty state", () => {
  assert.match(history, /Everything you have recorded for your pets, in one timeline\./);
  assert.match(history, /aria-label="History filters"/);
  assert.match(history, /Start your pets' history/);
  assert.match(history, /Food changes, routines, symptoms, products, and small observations will appear here in order\./);
  assert.doesNotMatch(history, />Care history</);
});

test("Ask fresh state uses a compact pet selector and one disclaimer", () => {
  assert.match(ask, /`Ask about \$\{petName\}`/);
  assert.match(ask, /Ask about changes, routines, products, or an upcoming vet visit\./);
  assert.match(ask, /function CompactPetSelector/);
  assert.doesNotMatch(ask, /function PetContextRail|Known context|Make this more specific/);
  assert.equal(ask.split("Furvise organizes care information and does not replace a veterinarian.").length - 1, 1);
});

test("Products centers one search with four popular categories", () => {
  assert.match(products, /title=\{`Products for \$\{selectedPetName \|\| "your pet"\}`\}/);
  assert.match(products, /What are you looking for\?/);
  assert.match(products, /\["Food", "Dental", "Grooming", "Skin and coat"\]/);
  assert.doesNotMatch(products, /Product AI included this month|Product country:|Search carefully using/);
  assert.doesNotMatch(products, /lg:grid-cols-\[minmax\(22\.5rem/);
});

test("Products is present in desktop navigation and under More on mobile", () => {
  const mobileNavigation = header.slice(header.indexOf("const MOBILE_NAV_ITEMS"), header.indexOf("export function AppHeader"));
  assert.doesNotMatch(mobileNavigation, /Products|\/shop/);
  const desktopNavigation = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  assert.match(desktopNavigation, /href: "\/shop", label: "Products"/);
  assert.match(header, />More<[\s\S]*href="\/shop"[\s\S]*>Products</);
  assert.doesNotMatch(read("app/components/signed-in-header.tsx"), /href: "\/shop"|Browse products/);
});

test("Vet brief presents Review, Confirm, Share while retaining export controls", () => {
  assert.match(vetBrief, /Review details/);
  assert.match(vetBrief, /Confirm/);
  assert.match(vetBrief, /Share/);
  assert.match(vetBrief, /Download PDF/);
  assert.match(vetBrief, /\/print/);
  assert.match(vetBrief, /Information not yet recorded/);
});

test("primary product surfaces contain no banned visible phrases", () => {
  const source = [homepage, today, pets, history, ask, products, vetBrief].join("\n");
  for (const phrase of ["Practical guidance that remembers your pet", "Search carefully using saved context", "Product AI included this month", "Known context", "Make this more specific", "Next best action", "powered by AI", "saved data analysis"]) {
    assert.doesNotMatch(source, new RegExp(phrase, "i"));
  }
  assert.doesNotMatch(source, /—/);
});

test("mobile task surfaces reserve space for reachable navigation and composers", () => {
  assert.match(header, /fixed inset-x-0 bottom-0/);
  assert.match(ask, /app-sticky-composer sticky/);
  assert.match(globals, /--mobile-nav-safe-area: env\(safe-area-inset-bottom, 0px\)[\s\S]*\.app-sticky-composer[\s\S]*var\(--mobile-nav-safe-area\)/);
  assert.match(vetBrief, /bottom-14[\s\S]*lg:bottom-0/);
  assert.match(globals, /max-width: 100vw/);
});
