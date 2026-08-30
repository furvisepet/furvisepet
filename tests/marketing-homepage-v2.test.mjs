import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const homepage = read("app/components/homepage-client.tsx");
const css = read("app/globals.css");
const brand = read("app/components/brand-mark.tsx");
const page = read("app/page.tsx");
const seo = read("app/lib/seo.ts");
const appHeader = read("app/components/app-header.tsx");
const signedInHeader = read("app/components/signed-in-header.tsx");

const renderedHomepage = homepage.slice(homepage.indexOf("export function HomepageClient"), homepage.indexOf("function PublicMarketingHeader"));
const marketingHeader = homepage.slice(homepage.indexOf("function PublicMarketingHeader"), homepage.indexOf("function WhyWeExist"));
const desktopNavigation = homepage.slice(homepage.indexOf("const HOMEPAGE_DESKTOP_NAVIGATION"), homepage.indexOf("const HOMEPAGE_MOBILE_NAVIGATION"));
const mobileNavigation = homepage.slice(homepage.indexOf("const HOMEPAGE_MOBILE_NAVIGATION"), homepage.indexOf("export function HomepageClient"));
const homepageCss = css.slice(css.indexOf(".homepage-dark-world"), css.indexOf(".mobile-liquid-glass-root"));
const mainStory = homepage.slice(homepage.indexOf('<main className="homepage-dark-world"'), homepage.indexOf("</main>"));

test("homepage removes every illustrative product example", () => {
  assert.doesNotMatch(homepage, /Mani|Illustrative example|ProductWindow|product-frame|product-example|history-example|ask-context-example|Vet Visit Brief|fake (?:chat|product)|screenshot/i);
  assert.doesNotMatch(homepage, /fetch\(|\/api\/|createConversation|saveConversation|onSubmit=/);
  assert.equal((homepage.match(/<Image/g) || []).length, 1, "only shared mobile navigation icons use Image");
});

test("cream header and footer frame one continuous dark main story", () => {
  assert.match(homepage, /homepage-marketing-header[\s\S]*data-marketing-surface="light"/);
  assert.match(homepage, /<main className="homepage-dark-world" data-marketing-surface="dark"/);
  assert.match(homepage, /homepage-marketing-footer[\s\S]*data-marketing-surface="light"/);
  assert.equal((homepage.match(/data-marketing-surface="dark"/g) || []).length, 1);
  assert.equal((homepage.match(/data-marketing-surface="light"/g) || []).length, 2);
  assert.match(css, /--marketing-forest: #071A15/);
  assert.match(homepageCss, /\.homepage-dark-world \{[\s\S]*background: var\(--marketing-forest\)/);
  assert.doesNotMatch(mainStory, /homepage-light-story|data-marketing-surface="light"/);
});

test("approved brand sits directly on cream without a logo patch or pill", () => {
  assert.match(marketingHeader, /homepage-brand-link[\s\S]*<BrandMark priority size=\{28\}/);
  assert.match(homepage, /homepage-footer-brand[\s\S]*<BrandMark size=\{26\}/);
  assert.doesNotMatch(homepage, /homepage-brand-lockup|brand-mark-background|logo-pill|rounded-full[^\n]*BrandMark/);
  const brandRules = homepageCss.slice(homepageCss.indexOf(".homepage-brand-link"), homepageCss.indexOf(".homepage-header-navigation-zone"));
  assert.doesNotMatch(brandRules, /background:|padding:/);
  assert.equal((brand.match(/priority=\{priority\}/g) || []).length, 3);
  assert.doesNotMatch(brand, /data-ui="brand-mark"|loading=\{priority/);
});

test("anonymous header is brand plus Sign in and Get started", () => {
  assert.match(marketingHeader, /const anonymous = mode === "anonymous"/);
  assert.match(marketingHeader, /href="\/login">Sign in/);
  assert.match(marketingHeader, /href=\{NEW_PET_LOGIN_PATH\}>Get started/);
  assert.doesNotMatch(marketingHeader, /marketing navigation|Learn more|Products/);
});

test("authenticated desktop header exposes plain app links without old AppHeader chrome", () => {
  for (const [href, label] of [["/dashboard", "Today"], ["/pets", "Pets"], ["/care-log", "History"], ["/ask", "Ask"]]) {
    assert.match(desktopNavigation, new RegExp(`href: "${href}", label: "${label}"`));
  }
  assert.doesNotMatch(desktopNavigation, /Products|\/shop/);
  assert.match(marketingHeader, /signedIn \? \([\s\S]*homepage-desktop-navigation/);
  assert.match(marketingHeader, /href="\/account">Account/);
  assert.doesNotMatch(homepage, /SignedInHeader|AppHeader|desktop-navigation-container|rounded-navigation|APP_NAV_ITEMS/);
  assert.doesNotMatch(homepageCss.slice(homepageCss.indexOf(".homepage-desktop-navigation"), homepageCss.indexOf(".homepage-header-actions")), /background:|border:|border-radius:/);
});

test("one three-zone header keeps geometry stable through auth resolution", () => {
  assert.equal((homepage.match(/data-ui="public-marketing-header"/g) || []).length, 1);
  for (const zone of ["homepage-header-brand-zone", "homepage-header-navigation-zone", "homepage-header-actions"]) assert.match(marketingHeader, new RegExp(zone));
  assert.match(css, /\.homepage-header-grid \{[\s\S]*min-height: 4\.5rem;[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(26rem, auto\) minmax\(0, 1fr\)/);
  assert.match(css, /\.homepage-header-navigation-zone \{[\s\S]*min-width: 26rem/);
  assert.match(css, /\.homepage-header-actions \{[\s\S]*min-width: 12\.5rem/);
  assert.match(homepage, /auth\.status === "loading"[\s\S]*\? "loading"/);
});

test("hero and all six company-story headlines use the approved direction", () => {
  assert.match(homepage, /aria-label="Remember what matters\."/);
  for (const headline of [
    "REMEMBER",
    "PETS CHANGE.",
    "ONE STORY.",
    "YOU DON&apos;T HAVE TO",
    "WHEN YOU NEED IT,",
    "YOUR PET&apos;S STORY",
    "START WITH",
  ]) assert.equal(homepage.split(headline).length - 1, 1, `${headline} appears once`);
});

test("all approved human-language chapter copy is exact", () => {
  for (const copy of [
    "Your pet has a whole life happening between vet visits. Most of it lives in your head, your camera roll, old messages, and random notes. Furvise is here to keep the important parts together.",
    "A food change. A rough night. Something they kept doing. Something that finally got better. Months later, those little details are usually the ones you&apos;re trying hardest to remember.",
    "Tell Furvise when something changes. Ask when you&apos;re unsure. It keeps what you share connected to the same pet, so the next time you come back, you&apos;re not starting over.",
    "Furvise isn&apos;t another thing you need to update every day. Use it when something matters. We&apos;ll help keep the story from getting scattered.",
    "Look back at what changed. Ask without explaining everything again. Walk into a vet visit without trying to rebuild the last few months from memory.",
    "The longer you care for a pet, the more their history matters. Furvise is being built to keep that history useful, understandable, and close when you need it.",
    "You don&apos;t need to remember everything on day one. Just start.",
  ]) assert.equal(homepage.split(copy).length - 1, 1, copy);
});

test("anonymous and signed-in story actions keep simple routing", () => {
  assert.match(homepage, /mode === "anonymous" \? NEW_PET_LOGIN_PATH : "\/dashboard"/);
  assert.match(homepage, /mode === "anonymous" \? "Get started" : "Go to Today"/);
  assert.doesNotMatch(homepage, /secondary.*(?:button|action)|Explore platform|Learn more|Discover Furvise/i);
});

test("trust line remains exact and quiet near the final chapter", () => {
  assert.equal(homepage.split("Furvise helps organize pet care information and does not replace veterinary care.").length - 1, 1);
  const final = homepage.slice(homepage.indexOf("function FinalChapter"), homepage.indexOf("function StoryAction"));
  assert.match(final, /START WITH[\s\S]*YOUR PET\.[\s\S]*homepage-trust-line/);
});

test("signed-in mobile navigation reuses Furvise routes and omits Products", () => {
  assert.match(renderedHomepage, /\{signedIn \? <HomepageMobileNavigation \/> : null\}/);
  assert.match(homepage, /data-ui="mobile-bottom-navigation"/);
  assert.match(mobileNavigation, /MOBILE_NAVIGATION_ITEMS\[0\][\s\S]*MOBILE_NAVIGATION_ITEMS\[1\][\s\S]*MOBILE_NAVIGATION_ITEMS\[2\][\s\S]*MOBILE_NAVIGATION_ITEMS\[3\]/);
  assert.match(mobileNavigation, /NAVIGATION_ICON_ASSETS\.more[\s\S]*href: "\/account"[\s\S]*label: "More"/);
  assert.doesNotMatch(mobileNavigation, /Products|\/shop/);
  assert.match(homepageCss, /\.homepage-mobile-navigation \{[\s\S]*position: fixed[\s\S]*background: var\(--warm-cream\)/);
  assert.match(css, /\.homepage-footer-mobile-clearance \{[\s\S]*var\(--mobile-nav-height\)/);
});

test("story rhythm varies by chapter and becomes content-driven on mobile", () => {
  for (const position of ["right", "left", "left-inset", "right-wide"]) assert.match(homepage, new RegExp(`position="${position}"`));
  for (const pace of ["standard", "tall", "spacious"]) assert.match(homepage, new RegExp(`pace="${pace}"`));
  assert.match(homepageCss, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.homepage-story-chapter,[\s\S]*min-height: auto/);
  assert.match(homepage, /overflow-x-hidden/);
});

test("homepage contains no feature grid or banned visual treatment", () => {
  assert.doesNotMatch(homepage, /feature-card|feature-grid|grid-cols-3|<video|autoplay|gradient|mesh|glassmorphism|homepage-product/i);
  assert.doesNotMatch(homepageCss, /gradient|glow|backdrop-filter|warm-orange|focus-orange/);
  assert.doesNotMatch(homepage, /orange|purple/i);
});

test("homepage language avoids banned software and AI marketing terms", () => {
  for (const phrase of [
    "AI-powered", "AI pet care", "longitudinal", "context layer", "context engine", "intelligence platform",
    "personalized insights", "health insights", "ecosystem", "solution", "revolutionary", "smart pet parenting",
    "track your pet's health", "optimize", "seamless", "unlock", "leverage",
  ]) assert.doesNotMatch(homepage, new RegExp(phrase, "i"));
});

test("application chrome, routes, pet authority, and SEO remain intact", () => {
  assert.match(homepage, /activePetsOnly\(profiles\)/);
  assert.match(appHeader, /return \([\s\S]*data-ui="app-header"/);
  assert.match(signedInHeader, /<AppHeader/);
  for (const route of ["/dashboard", "/pets", "/care-log", "/ask"]) assert.match(`${homepage}\n${appHeader}`, new RegExp(route.replace("/", "\\/")));
  assert.match(page, /createPublicPageMetadata[\s\S]*path: "\/"/);
  assert.match(seo, /CANONICAL_ORIGIN = "https:\/\/www\.furvise\.com"/);
});

test("approved Furvise artwork remains byte-for-byte unchanged", () => {
  const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex");
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103e452559f4f29b0492a6731782ecd680992f62798be95ddc7aba544f3b00");
  assert.equal(hash("public/brand/furvise-wordmark.svg"), "5ce60b7d3134b5aaf00f4a4a799f46443a9eb0fd23b04724a545ad15f7c248b8");
  assert.equal(hash("public/brand/furvise-heron.svg"), "5bc3424afd22bba0391d302494c506455df9ef3a2221525c32a033e8dda0dd0b");
});
