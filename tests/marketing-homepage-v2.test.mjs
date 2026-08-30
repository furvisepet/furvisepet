import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const homepage = read("app/components/homepage-client.tsx");
const brand = read("app/components/brand-mark.tsx");
const css = read("app/globals.css");
const page = read("app/page.tsx");
const seo = read("app/lib/seo.ts");
const appChrome = read("app/components/authenticated-app-chrome.tsx");
const signedInHeader = read("app/components/signed-in-header.tsx");

const header = homepage.slice(homepage.indexOf("function PublicMarketingHeader"), homepage.indexOf("function Hero("));
const hero = homepage.slice(homepage.indexOf("function Hero("), homepage.indexOf("function HeroActions"));
const renderedHomepage = homepage.slice(homepage.indexOf("export function HomepageClient"), homepage.indexOf("function PublicMarketingHeader"));
const homepageCss = css.slice(css.indexOf(".homepage-primary-action"), css.indexOf(".mobile-liquid-glass-root"));

test("one stable marketing header owns every homepage auth state", () => {
  assert.match(renderedHomepage, /<PublicMarketingHeader mode=\{mode\} \/>/);
  assert.equal((homepage.match(/data-ui="public-marketing-header"/g) || []).length, 1);
  assert.doesNotMatch(homepage, /SignedInHeader|AppHeader|APP_NAV_ITEMS|app-mobile-nav-clearance/);
  assert.doesNotMatch(header, />Today<|>Pets<|>History<|>Ask<|>Products</);
});

test("header geometry is reserved and personalized without replacement", () => {
  const actions = homepage.slice(homepage.indexOf("function HomepageHeaderActions"), homepage.indexOf("function Hero("));
  assert.match(header, /min-h-\[4\.25rem\][\s\S]*sm:min-h-\[4\.5rem\]/);
  assert.match(header, /<BrandMark priority size=\{26\}/);
  assert.match(header, /--brand-mark-size:1\.625rem[\s\S]*--brand-mark-size:1\.75rem/);
  assert.match(actions, /const actionRegionClass = "flex h-12 w-\[11\.5rem\][\s\S]*sm:w-\[13rem\]/);
  assert.match(actions, /mode === "loading"[\s\S]*className=\{actionRegionClass\}/);
  assert.match(actions, /href="\/login">Sign in/);
  assert.match(actions, /href=\{NEW_PET_LOGIN_PATH\}>Get started/);
  assert.match(actions, /href="\/account">Account/);
  assert.match(actions, /mode === "with-pet" \? "\/dashboard" : NEW_PET_ONBOARDING_PATH/);
  assert.match(actions, /mode === "with-pet" \? "Go to Today" : "Add your pet"/);
});

test("header and hero share the dark Furvise marketing surface", () => {
  assert.match(header, /bg-\[var\(--marketing-forest\)\][\s\S]*data-marketing-surface="dark"/);
  assert.match(hero, /homepage-hero bg-\[var\(--marketing-forest\)\][\s\S]*data-marketing-surface="dark"/);
  assert.match(css, /--marketing-forest: #071A15/);
  assert.match(css, /\.homepage-dark-world \{[\s\S]*background: var\(--marketing-forest\)/);
});

test("hero thesis and contextual routes remain unchanged", () => {
  assert.match(hero, /Furvise remembers your pet, so you don&apos;t start from zero\./);
  assert.match(hero, /Ask questions, add updates when something changes, and keep their story together over time\./);
  assert.match(homepage, /mode === "with-pet"[\s\S]*Go to Today[\s\S]*Ask about \{petName\}/);
  assert.match(homepage, /mode === "no-pets"[\s\S]*NEW_PET_ONBOARDING_PATH/);
  assert.match(homepage, /NEW_PET_LOGIN_PATH[\s\S]*>Get started<\/MarketingPrimaryLink>/);
  assert.doesNotMatch(hero, /marketing pill|See how Furvise works|Learn more|Takes about two minutes/i);
});

test("the old feature strip is replaced by four editorial chapters", () => {
  assert.doesNotMatch(homepage, /VALUE_BEATS|ValueBeats|homepage-value-beats|md:grid-cols-3/);
  for (const title of [
    "Keep the context.",
    "Add it when something changes.",
    "Ask without starting over.",
    "Have the story when you need it.",
  ]) assert.equal(homepage.split(title).length - 1, 1);
  assert.equal((homepage.match(/data-story-section=/g) || []).length, 3);
  assert.match(homepage, /<ContextStory \/>[\s\S]*<UpdateStory \/>[\s\S]*<AskStory \/>[\s\S]*<HistoryVetStory \/>/);
  assert.doesNotMatch(homepage, /feature-card|grid of cards|icon-wall/i);
});

test("the update chapter is the only intentional light major section", () => {
  assert.equal((homepage.match(/data-marketing-surface="light"/g) || []).length, 1);
  assert.match(homepage, /homepage-light-story[\s\S]*data-marketing-surface="light"[\s\S]*Add it when something changes\./);
  assert.match(homepage, /Add what matters when it happens\. You do not need to journal every day\./);
});

test("large deterministic product examples use Mani and stay illustrative", () => {
  for (const ui of ["homepage-product-example", "context-history-example", "update-history-example", "ask-context-example", "history-vet-example"]) {
    assert.equal((homepage.match(new RegExp(`data-ui="${ui}"`, "g")) || []).length, 1);
  }
  assert.match(homepage, /Ate normally after dinner[\s\S]*Paw licking looked better[\s\S]*Vet appointment/);
  assert.match(homepage, /Selected pet[\s\S]*Using Mani&apos;s profile and history/);
  assert.match(homepage, /Vet Visit Brief[\s\S]*Preview for Mani/);
  assert.ok((homepage.match(/Illustrative example/g) || []).length >= 1);
  const examples = homepage.slice(homepage.indexOf("function HeroProductPanel"), homepage.indexOf("function FinalCallToAction"));
  assert.doesNotMatch(examples, /fetch\(|\/api\/|onSubmit=|onClick=|createConversation|save(?:Data|Conversation|\()/);
});

test("trust statement and final conversion use approved exact copy", () => {
  assert.equal(homepage.split("Furvise helps organize pet care information and does not replace veterinary care.").length - 1, 1);
  assert.equal(homepage.split("Remember what matters.").length - 1, 1);
  assert.equal(homepage.split("Start with your pet. Furvise can keep the story from there.").length - 1, 1);
  assert.ok(renderedHomepage.indexOf("<FinalCallToAction") < renderedHomepage.indexOf("<MarketingFooter"));
  const final = homepage.slice(homepage.indexOf("function FinalCallToAction"), homepage.indexOf("function MarketingPrimaryLink"));
  assert.match(final, /NEW_PET_LOGIN_PATH[\s\S]*>Get started<\/MarketingPrimaryLink>/);
  assert.match(final, /authenticatedWithPet[\s\S]*Go to Today[\s\S]*Ask about \{petName\}/);
});

test("dark homepage branding stays local without changing shared BrandMark loading", () => {
  assert.equal((brand.match(/priority=\{priority\}/g) || []).length, 3);
  assert.doesNotMatch(brand, /data-ui="brand-mark"|loading=\{priority/);
  assert.doesNotMatch(homepage, /AppFooter/);
  assert.match(homepage, /function MarketingFooter[\s\S]*data-ui="homepage-marketing-footer"/);
  assert.match(homepage, /homepage-brand-lockup[\s\S]*<BrandMark size=\{24\}/);
});

test("dark marketing actions and focus treatments are high contrast without orange", () => {
  assert.match(homepageCss, /\.homepage-primary-action \{[\s\S]*background: var\(--marketing-text\)[\s\S]*color: var\(--marketing-forest\)/);
  assert.match(homepageCss, /\.homepage-primary-action \[data-button-label\][\s\S]*color: var\(--marketing-forest\)/);
  assert.match(homepageCss, /--focus-ring: var\(--soft-sage\)/);
  assert.doesNotMatch(homepage, /warm-orange|orange|action-primary/);
  assert.doesNotMatch(homepageCss, /warm-orange|focus-orange/);
});

test("homepage avoids unsupported visual and positioning patterns", () => {
  assert.doesNotMatch(homepage, /<video|autoplay|gradient|mesh|glassmorphism|purple|AI-powered|AI pet health|symptom checker|online vet|unlimited vet|join millions|revolutionary/i);
  assert.doesNotMatch(homepageCss, /gradient|glow|backdrop-filter/);
  assert.doesNotMatch(homepage, /testimonial|customer logo|pricing table/);
});

test("mobile hierarchy starts one-column, stays contained, and keeps touch targets", () => {
  assert.match(homepage, /overflow-x-hidden/);
  assert.doesNotMatch(homepage, /(?<![a-z]:)grid-cols-2|grid-cols-3|grid-cols-4/);
  assert.match(homepage, /grid items-center[\s\S]*lg:grid-cols-/);
  assert.match(homepage, /min-h-11 min-w-11/);
  assert.match(homepage, /homepage-primary-action min-h-11/);
  assert.match(css, /max-width: 100vw/);
});

test("signed-in app chrome and homepage SEO authority remain intact", () => {
  assert.match(homepage, /activePetsOnly\(profiles\)/);
  assert.match(appChrome, /return <SignedInHeader \/>/);
  assert.match(signedInHeader, /<AppHeader/);
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
