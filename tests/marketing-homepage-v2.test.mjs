import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const homepage = read("app/components/homepage-client.tsx");
const css = read("app/globals.css");
const seo = read("app/lib/seo.ts");
const page = read("app/page.tsx");

test("anonymous marketing header is restrained, accessible, and brand-canonical", () => {
  const header = homepage.slice(homepage.indexOf("function PublicMarketingHeader"), homepage.indexOf("function Hero("));
  assert.match(header, /data-ui="public-marketing-header"/);
  assert.match(header, /min-h-\[4\.25rem\][\s\S]*sm:min-h-\[4\.5rem\]/);
  assert.match(header, /<BrandMark priority size=\{26\}/);
  assert.match(header, /--brand-mark-size:1\.625rem[\s\S]*--brand-mark-size:1\.75rem/);
  assert.match(header, /aria-label="Furvise home"/);
  assert.match(header, /min-h-11 min-w-11/);
  assert.match(header, /href="\/login">Sign in/);
  assert.match(header, /href=\{NEW_PET_LOGIN_PATH\}>Get started/);
  assert.doesNotMatch(header, /Today|Pets|History|Ask|Products|Account|hamburger/i);
});

test("public hero states the exact continuity promise with one dominant action", () => {
  const hero = homepage.slice(homepage.indexOf("function Hero("), homepage.indexOf("function PetContextExample"));
  assert.match(hero, /Furvise remembers your pet, so you don&apos;t start from zero\./);
  assert.match(hero, /Ask questions, add updates when something changes, and keep their story together over time\./);
  assert.match(hero, /mode === "no-pets"[\s\S]*NEW_PET_ONBOARDING_PATH/);
  assert.match(hero, /NEW_PET_LOGIN_PATH[\s\S]*>Get started<\/MarketingPrimaryLink>/);
  assert.doesNotMatch(hero, /See how Furvise works|Learn more|Takes about two minutes|Pet care that is easier to remember/);
});

test("marketing actions use forest and never inherit the orange primary token", () => {
  assert.match(homepage, /homepage-primary-action/);
  assert.match(css, /\.homepage-primary-action \{[\s\S]*background: var\(--deep-forest\)[\s\S]*color: var\(--warm-cream\)/);
  assert.match(css, /\.homepage-primary-action \[data-button-label\][\s\S]*color: var\(--warm-cream\)/);
  assert.doesNotMatch(homepage, /warm-orange|action-primary/);
});

test("one illustrative product example demonstrates remembered pet context", () => {
  const example = homepage.slice(homepage.indexOf("function PetContextExample"), homepage.indexOf("function ValueBeats"));
  assert.equal(homepage.match(/data-ui="homepage-product-example"/g)?.length, 1);
  assert.match(example, /Illustrative example/);
  assert.match(example, />Mani</);
  assert.match(homepage, /Ate normally after dinner[\s\S]*Paw licking looked better[\s\S]*Vet appointment/);
  assert.match(example, /What should I keep an eye on before the visit\?/);
  assert.doesNotMatch(example, /fetch\(|\/api\/|onClick|button/);
});

test("homepage contains exactly three plain value beats", () => {
  const beats = ["KEEP THE CONTEXT", "UPDATE WHEN SOMETHING CHANGES", "HAVE THE STORY WHEN YOU NEED IT"];
  for (const beat of beats) assert.equal(homepage.split(beat).length - 1, 1);
  assert.match(homepage, /const VALUE_BEATS = \[[\s\S]*\] as const/);
  assert.equal((homepage.slice(homepage.indexOf("const VALUE_BEATS"), homepage.indexOf("export function HomepageClient")).match(/^  \[/gm) || []).length, 3);
  const section = homepage.slice(homepage.indexOf("function ValueBeats"), homepage.indexOf("function TrustLine"));
  assert.doesNotMatch(section, /rounded-2xl|shadow-|icon|<svg/i);
});

test("trust line and final conversion use the approved exact copy", () => {
  assert.match(homepage, /Furvise helps organize pet care information and does not replace veterinary care\./);
  assert.match(homepage, /Remember what matters\./);
  assert.equal(homepage.split("Remember what matters.").length - 1, 1);
  assert.match(homepage, /Start with your pet\. Furvise can keep the story from there\./);
  const renderedHomepage = homepage.slice(homepage.indexOf("export function HomepageClient"), homepage.indexOf("function PublicMarketingHeader"));
  assert.ok(renderedHomepage.indexOf("<FinalCallToAction") < renderedHomepage.indexOf("<AppFooter"));
  const finalIndex = homepage.indexOf('data-ui="homepage-final-conversion"');
  assert.match(homepage.slice(finalIndex), /NEW_PET_LOGIN_PATH[\s\S]*>Get started<\/MarketingPrimaryLink>/);
});

test("homepage excludes unsupported marketing patterns and banned positioning", () => {
  for (const phrase of [
    "AI-powered", "AI pet health", "track your pet's health", "symptom checker", "unlimited vet",
    "online vet", "journal every meal", "streak", "90% of conditions", "join millions",
    "limited-time offer", "revolutionary", "smarter pet parenting", "personalized health insights",
  ]) assert.doesNotMatch(homepage, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(homepage, /testimonial|customer logo|pricing table|gradient|glassmorphism|â€”|—/i);
});

test("responsive hierarchy is one-column first and touch-safe", () => {
  assert.match(homepage, /grid items-center[\s\S]*lg:grid-cols-/);
  assert.doesNotMatch(homepage, /grid-cols-2[\s\S]*lg:grid-cols-/);
  assert.match(homepage, /overflow-x-hidden/);
  assert.match(homepage, /min-h-11 min-w-11/);
  assert.match(homepage, /homepage-primary-action min-h-11/);
  assert.match(homepage, /<Hero[\s\S]*<ValueBeats \/>[\s\S]*<TrustLine \/>[\s\S]*<FinalCallToAction/);
});

test("signed-in routing and SEO authority remain intact", () => {
  assert.match(homepage, /<SignedInHeader variant="homepage" \/>/);
  assert.match(homepage, /activePetsOnly\(profiles\)/);
  assert.match(homepage, /mode === "with-pet"[\s\S]*Go to Today[\s\S]*Ask about \{petName\}/);
  assert.match(homepage, /mode === "no-pets"[\s\S]*NEW_PET_ONBOARDING_PATH/);
  assert.match(page, /createPublicPageMetadata[\s\S]*path: "\/"/);
  assert.match(page, /"@type": "WebSite"[\s\S]*"@type": "Organization"/);
  assert.match(page, /brand\/furvise-logo\.svg/);
  assert.match(seo, /CANONICAL_ORIGIN = "https:\/\/www\.furvise\.com"/);
  assert.match(seo, /Furvise \| Remember What Matters/);
});

test("approved Furvise artwork remains byte-for-byte unchanged", () => {
  const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex");
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103e452559f4f29b0492a6731782ecd680992f62798be95ddc7aba544f3b00");
  assert.equal(hash("public/brand/furvise-wordmark.svg"), "5ce60b7d3134b5aaf00f4a4a799f46443a9eb0fd23b04724a545ad15f7c248b8");
  assert.equal(hash("public/brand/furvise-heron.svg"), "5bc3424afd22bba0391d302494c506455df9ef3a2221525c32a033e8dda0dd0b");
});
