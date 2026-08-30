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

test("homepage uses the final corrective art map and no product examples", () => {
  assert.doesNotMatch(homepage, /Mani|Illustrative example|ProductWindow|product-frame|product-example|history-example|ask-context-example|Vet Visit Brief|fake (?:chat|product)|screenshot/i);
  assert.doesNotMatch(homepage, /fetch\(|\/api\/|createConversation|saveConversation|onSubmit=/);
  for (const asset of ["heron", "deer", "cat", "hummingbird"]) {
    assert.equal(homepage.split(`/images/${asset}.png`).length - 1, 1, `${asset} is referenced once`);
  }
  for (const unusedAsset of ["flamingo", "goat", "ostrich", "birds"]) assert.doesNotMatch(homepage, new RegExp(`/images/${unusedAsset}\\.png`));
  assert.doesNotMatch(mainStory, /<video|<picture|backgroundImage/);
  assert.equal((homepage.match(/<Image/g) || []).length, 5, "the header, footer, mobile navigation, hero, and reusable chapter art use Image");
});

test("editorial art is decorative, direct on forest, and limited to the approved chapters", () => {
  const hero = homepage.slice(homepage.indexOf("function WhyWeExist"), homepage.indexOf("function StoryChapter"));
  const chapterArt = homepage.slice(homepage.indexOf("function HomepageChapterArt"), homepage.indexOf("function FinalChapter"));
  assert.match(hero, /homepage-art-heron[\s\S]*data-art="heron"[\s\S]*<Image alt="" aria-hidden="true"[\s\S]*fill priority[\s\S]*src="\/images\/heron\.png"/);
  assert.match(chapterArt, /homepage-art-\$\{art\}[\s\S]*<Image alt="" aria-hidden="true"[\s\S]*loading="lazy"[\s\S]*sizes=\{asset\.sizes\}/);
  for (const [id, art] of [["the-reality", "deer"], ["one-story", "cat"], ["when-needed", "hummingbird"]]) {
    assert.match(renderedHomepage, new RegExp(`art="${art}"[^>]*id="${id}"`));
  }
  for (const id of ["track-less", "bigger-idea"]) {
    const invocation = renderedHomepage.match(new RegExp(`<StoryChapter[^>]*id="${id}"[^>]*>`))?.[0] || "";
    assert.doesNotMatch(invocation, /art=/, `${id} remains type-only`);
  }
  const artCss = homepageCss.slice(homepageCss.indexOf(".homepage-story-art {"), homepageCss.indexOf(".homepage-story-hero .homepage-story-inner"));
  assert.doesNotMatch(artCss, /background|box-shadow|filter|gradient|border-radius/);
  assert.match(homepageCss, /\.homepage-story-chapter\[data-art\] \{[\s\S]*overflow: visible/);
  assert.match(homepageCss, /\.homepage-story-art-image \{[\s\S]*object-fit: contain/);
  assert.match(homepageCss, /\.homepage-chapter-art \.homepage-story-art-image \{[\s\S]*object-fit: contain;[\s\S]*object-position: center/);
  assert.doesNotMatch(homepageCss, /object-fit: cover|overflow: clip/);
  assert.doesNotMatch(artCss, /margin-(?:left|right):\s*-/);
  for (const art of ["heron", "deer", "cat", "hummingbird"]) assert.match(homepageCss, new RegExp(`\\.homepage-art-${art} \\{`));
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.homepage-story-chapter\[data-art="cat"\] \.homepage-story-block \{[\s\S]*order: -1/);
});

test("desktop art is independently staged while text stays grid-aligned", () => {
  const desktopStageCss = css.slice(css.indexOf("@media (min-width: 1024px)"), css.indexOf(".homepage-story-body"));
  assert.match(desktopStageCss, /\.homepage-story-chapter\[data-art\] \.homepage-story-art,[\s\S]*\.homepage-story-hero \.homepage-story-art \{[\s\S]*position: absolute;[\s\S]*grid-column: auto;[\s\S]*grid-row: auto/);
  for (const art of ["heron", "deer", "cat", "hummingbird"]) {
    assert.match(desktopStageCss, new RegExp(`\\.homepage-art-${art} \\{[\\s\\S]*width:`));
  }
  assert.match(desktopStageCss, /\.homepage-art-heron \{[\s\S]*right: -1vw;[\s\S]*bottom: -1vh;[\s\S]*width: min\(60vw,[\s\S]*height: min\(88svh/);
  assert.match(desktopStageCss, /\.homepage-art-deer \{[\s\S]*left: -5vw;[\s\S]*bottom: -1vh;[\s\S]*width: min\(55vw,[\s\S]*height: min\(84svh/);
  assert.match(desktopStageCss, /\.homepage-art-cat \{[\s\S]*right: -3vw;[\s\S]*bottom: 0;[\s\S]*width: min\(52vw,[\s\S]*height: min\(80svh/);
  assert.match(desktopStageCss, /\.homepage-art-hummingbird \{[\s\S]*top: 48%;[\s\S]*left: 0;[\s\S]*width: min\(48vw,[\s\S]*height: auto;[\s\S]*aspect-ratio: 3 \/ 2;[\s\S]*transform: translateY\(-50%\)/);
  assert.doesNotMatch(desktopStageCss, /data-art="(?:deer|cat|hummingbird)"\][^{]*\.homepage-chapter-art[^}]*grid-column:/);
  assert.doesNotMatch(css, /@media \(min-width: 1024px\) and \(max-width: 1350px\)[\s\S]*\.homepage-art-heron/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.homepage-chapter-art \{[\s\S]*position: relative;[\s\S]*inset: auto;[\s\S]*transform: none/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.homepage-story-chapter\[data-art\]:not\(\.homepage-story-hero\) \.homepage-chapter-art\.homepage-art-deer \{[\s\S]*width: min\(100vw,[\s\S]*aspect-ratio: 2 \/ 3/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.homepage-story-chapter\[data-art\]:not\(\.homepage-story-hero\) \.homepage-chapter-art\.homepage-art-cat \{[\s\S]*width: min\(100vw,[\s\S]*aspect-ratio: 2 \/ 3/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.homepage-story-chapter\[data-art\]:not\(\.homepage-story-hero\) \.homepage-chapter-art\.homepage-art-hummingbird \{[\s\S]*width: min\(100vw,[\s\S]*aspect-ratio: 3 \/ 2/);
  assert.match(desktopStageCss, /\.homepage-story-hero \{[\s\S]*min-height: calc\(95svh - 3\.5rem\)/);
  for (const [selector, height] of [["#the-reality", "76"], ["#one-story", "72"], ["#track-less", "47"], ["#when-needed", "64"]]) {
    assert.match(desktopStageCss, new RegExp(`${selector} \\{[\\s\\S]*min-height: ${height}svh`));
  }
  assert.match(desktopStageCss, /#bigger-idea,\s*\.homepage-story-chapter\.homepage-final-chapter \{[\s\S]*min-height: 48svh/);
  assert.match(desktopStageCss, /#bigger-idea \.homepage-story-block \{[\s\S]*grid-column: 7 \/ 13/);
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

test("approved premium full logo sits directly on cream without a patch or pill", () => {
  assert.match(marketingHeader, /homepage-brand-link[\s\S]*<Image[^>]*priority[^>]*src="\/brand\/furvise-logo\.svg"/);
  assert.match(homepage, /homepage-footer-brand[\s\S]*<Image[^>]*src="\/brand\/furvise-logo\.svg"/);
  assert.equal((homepage.match(/src="\/brand\/furvise-logo\.svg"/g) || []).length, 2);
  assert.doesNotMatch(homepage, /<BrandMark|homepage-brand-lockup|brand-mark-background|logo-pill|rounded-full[^\n]*homepage-full-logo/);
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
  assert.match(homepageCss, /\.homepage-header-text-link,[\s\S]*font-size: 0\.8125rem;[\s\S]*font-weight: 700;[\s\S]*text-transform: uppercase/);
});

test("one slim three-zone header keeps geometry stable through auth resolution", () => {
  assert.equal((homepage.match(/data-ui="public-marketing-header"/g) || []).length, 1);
  for (const zone of ["homepage-header-brand-zone", "homepage-header-navigation-zone", "homepage-header-actions"]) assert.match(marketingHeader, new RegExp(zone));
  assert.match(css, /\.homepage-header-grid \{[\s\S]*height: 3\.5rem;[\s\S]*min-height: 3\.5rem;[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(24rem, auto\) minmax\(0, 1fr\)/);
  assert.match(css, /\.homepage-header-navigation-zone \{[\s\S]*min-width: 24rem/);
  assert.match(css, /\.homepage-header-actions \{[\s\S]*min-width: 11\.75rem/);
  assert.match(css, /@media \(max-width: 479px\)[\s\S]*\.homepage-header-grid \{[\s\S]*height: 3\.375rem;[\s\S]*min-height: 3\.375rem/);
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
    "The longer you care for a pet, the more their history matters. Furvise keeps that history useful, understandable, and close when you need it.",
    "You don&apos;t need to remember everything on day one. Just start.",
  ]) assert.equal(homepage.split(copy).length - 1, 1, copy);
});

test("story actions preserve anonymous, no-pet, and with-pet authority", () => {
  assert.match(homepage, /mode === "anonymous"[\s\S]*href: NEW_PET_LOGIN_PATH, label: "Get started"/);
  assert.match(homepage, /mode === "no-pets"[\s\S]*href: NEW_PET_ONBOARDING_PATH, label: "Add your pet"/);
  assert.match(homepage, /href: "\/dashboard", label: "Go to Today"/);
  for (const [id, action] of [["the-reality", "history"], ["one-story", "pets"], ["track-less", "today"], ["when-needed", "ask"], ["bigger-idea", "history"]]) {
    assert.match(renderedHomepage, new RegExp(`action="${action}"[^>]*id="${id}"`));
  }
  assert.match(homepage, /buildLoginHref\("\/care-log"\), label: "View history"/);
  assert.match(homepage, /href: "\/care-log", label: "View history"/);
  assert.match(homepage, /href: NEW_PET_LOGIN_PATH, label: "Your pets"/);
  assert.match(homepage, /href: "\/pets", label: "Your pets"/);
  assert.match(homepage, /buildLoginHref\("\/ask"\), label: "Ask Furvise"/);
  assert.match(homepage, /mode === "with-pet" && activePetId \? `\/ask\?pet=\$\{encodeURIComponent\(activePetId\)\}` : "\/ask"/);
  assert.match(homepageCss, /\.homepage-story-action \{[\s\S]*min-height: 2\.75rem;[\s\S]*border-radius: 0\.25rem;[\s\S]*text-transform: uppercase/);
  assert.doesNotMatch(homepage, /secondary.*(?:button|action)|Explore platform|Learn more|Discover Furvise/i);
});

test("trust line remains exact and quiet near the final chapter", () => {
  assert.equal(homepage.split("Furvise helps organize pet care information and does not replace veterinary care.").length - 1, 1);
  const final = homepage.slice(homepage.indexOf("function FinalChapter"), homepage.indexOf("function StoryAction"));
  assert.match(final, /START WITH[\s\S]*YOUR PET\.[\s\S]*homepage-trust-line/);
});

test("signed-in mobile navigation uses an honest Account destination and omits Products", () => {
  assert.match(renderedHomepage, /\{signedIn \? <HomepageMobileNavigation \/> : null\}/);
  assert.match(homepage, /data-ui="mobile-bottom-navigation"/);
  assert.match(mobileNavigation, /MOBILE_NAVIGATION_ITEMS\[0\][\s\S]*MOBILE_NAVIGATION_ITEMS\[1\][\s\S]*MOBILE_NAVIGATION_ITEMS\[2\][\s\S]*MOBILE_NAVIGATION_ITEMS\[3\]/);
  assert.match(mobileNavigation, /NAVIGATION_ICON_ASSETS\.more[\s\S]*href: "\/account"[\s\S]*label: "Account"/);
  assert.doesNotMatch(mobileNavigation, /href: "\/account", label: "More"/);
  assert.doesNotMatch(mobileNavigation, /Products|\/shop/);
  assert.match(homepageCss, /\.homepage-mobile-navigation \{[\s\S]*position: fixed[\s\S]*background: var\(--warm-cream\)/);
  assert.match(css, /\.homepage-footer-mobile-clearance \{[\s\S]*var\(--mobile-nav-height\)/);
});

test("story rhythm varies by chapter and becomes content-driven on mobile", () => {
  for (const position of ["right", "left", "right-wide"]) assert.match(homepage, new RegExp(`position="${position}"`));
  for (const pace of ["standard", "tall", "spacious"]) assert.match(homepage, new RegExp(`pace="${pace}"`));
  assert.match(homepageCss, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.homepage-story-chapter,[\s\S]*min-height: auto/);
  assert.match(homepage, /overflow-x-hidden/);
  assert.match(homepageCss, /\.homepage-story-chapter \{[\s\S]*min-height: 72svh/);
  assert.match(homepageCss, /#track-less \{[\s\S]*min-height: 47svh/);
  assert.match(homepageCss, /#bigger-idea,[\s\S]*\.homepage-story-chapter\.homepage-final-chapter \{[\s\S]*min-height: 48svh/);
});

test("editorial type is uppercase, compact, and readable without a new font dependency", () => {
  assert.match(homepageCss, /\.homepage-story-heading \{[\s\S]*font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;[\s\S]*font-size: clamp\(3\.25rem, 5vw, 4\.5rem\);[\s\S]*font-weight: 800;[\s\S]*line-height: 0\.92/);
  assert.match(homepageCss, /\.homepage-hero-heading \{[\s\S]*font-size: clamp\(4\.375rem, 6\.4vw, 5\.75rem\)/);
  assert.match(homepageCss, /\.homepage-story-body \{[\s\S]*max-width: 38rem;[\s\S]*font-size: clamp\(1\.0625rem, 1\.25vw, 1\.1875rem\);[\s\S]*line-height: 1\.58/);
  assert.doesNotMatch(homepage, /@font-face|next\/font|fonts\.(?:googleapis|gstatic)/);
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
  assert.equal(hash("public/images/heron.png"), "b9ad70d152185b8561015b1697f25fb4d409c241297129229f0c754c61638793");
  assert.equal(hash("public/images/flamingo.png"), "03cd340a13e7cecacfa7631433d817766eb941287eb48c4cfa2ef8093e271a27");
  assert.equal(hash("public/images/goat.png"), "54eb8be2f0c1878e3bd1058510f5d976c7fede2b850d443c091c5dc0d7c76a97");
  assert.equal(hash("public/images/ostrich.png"), "942b88b30f76d8d24e8661d01ecc064a2dd2c35beea126144fd54004b4335f3d");
  assert.equal(hash("public/images/cat.png"), "be7498352c359a0da98b723f8852d5177cd34e8160046bbf4f85a38db9b80d77");
  assert.equal(hash("public/images/deer.png"), "e3d738ddd62940868c6a249a8a41d91169868a71a6fc531f33819e431cca06d5");
  assert.equal(hash("public/images/hummingbird.png"), "6fa625213608a17eb91fd8b20176d4d9497b78c870e959c977fdfe4fa5710276");
  assert.equal(hash("public/images/birds.png"), "0974af9c75fa907081ae03db4cf0f10f7ae31eb805df946a88a47792ba8b594d");
});
