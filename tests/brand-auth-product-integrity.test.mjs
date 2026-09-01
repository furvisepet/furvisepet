import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

function appFiles(directory = "app") {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? appFiles(relative) : [relative];
  });
}

test("approved compact Furvise assets are composed by the shared BrandMark", () => {
  const brand = read("app/components/brand-mark.tsx");
  const header = read("app/components/app-header.tsx");
  const namedMark = brand.slice(brand.indexOf("if (showName)"), brand.lastIndexOf("\n  return ("));
  const iconOnlyMark = brand.slice(brand.lastIndexOf("\n  return ("));
  const liveBrandReferences = [
    ...appFiles().filter((file) => /\.(?:tsx|ts)$/.test(file)).map(read),
    read("public/manifest.webmanifest"),
  ].join("\n");

  assert.match(brand, /FURVISE_BRAND_ASSET = "\/brand\/furvise-logo\.svg"/);
  assert.match(brand, /FURVISE_WORDMARK_ASSET = "\/brand\/furvise-wordmark\.svg"/);
  assert.match(brand, /FURVISE_MASCOT_ASSET = "\/brand\/furvise-heron\.svg"/);
  assert.match(namedMark, /src=\{FURVISE_WORDMARK_ASSET\}/);
  assert.match(namedMark, /src=\{FURVISE_MASCOT_ASSET\}/);
  assert.ok(namedMark.indexOf("src={FURVISE_WORDMARK_ASSET}") < namedMark.indexOf("src={FURVISE_MASCOT_ASSET}"));
  assert.match(namedMark, /columnGap: "6px"/);
  assert.match(iconOnlyMark, /src=\{FURVISE_MASCOT_ASSET\}/);
  assert.doesNotMatch(iconOnlyMark, /FURVISE_WORDMARK_ASSET|FURVISE_BRAND_ASSET/);
  assert.match(brand, /import Image from "next\/image"/);
  assert.equal((brand.match(/priority=\{priority\}/g) || []).length, 3);
  assert.doesNotMatch(brand, /data-ui="brand-mark"|loading=\{priority/);
  assert.doesNotMatch(liveBrandReferences, /logo-header-v1\.webp|\/brand\/logo\.png|App(?:%20| )icon(?:\.png)?/i);
  assert.doesNotMatch(brand, /filter/);
  assert.match(header, /className="homepage-full-logo"[\s\S]*src="\/brand\/furvise-logo\.svg"/);
  assert.doesNotMatch([header, read("app/components/homepage-client.tsx")].join("\n"), /next\.svg|vercel\.svg|triangle(?:-|_)icon|house(?:-|_)icon/i);
});

test("manifest and metadata declare the approved browser and installed-app icons", () => {
  const manifest = read("public/manifest.webmanifest");
  const layout = read("app/layout.tsx");
  assert.match(manifest, /"src": "\/favicon\.ico"/);
  assert.match(layout, /url: "\/favicon\.ico"/);
  for (const asset of ["favicon-16.png", "favicon-32.png", "apple-touch-icon.png", "android-192.png", "android-512.png", "maskable-icon-512.png"]) {
    assert.match(`${manifest}\n${layout}`, new RegExp(asset.replace(".", "\\.")));
  }
});

test("the warm forest, sage, cream, and orange palette drives the permanent light color system", () => {
  const css = read("app/globals.css");
  const scheme = css.slice(css.indexOf(":root"), css.indexOf("@theme inline"));
  assert.match(scheme, /color-scheme: light/);
  assert.match(scheme, /--page-background: var\(--warm-canvas\)/);
  assert.match(scheme, /--primary-action-background: var\(--warm-orange\)/);
  assert.match(scheme, /--secondary-action-background: var\(--warm-cream\)/);
  assert.match(scheme, /--focus-ring: var\(--forest\)/);
  assert.doesNotMatch(css, /data-theme|prefers-color-scheme|brand-dark-surface/);
});

test("account notification dot is absent by default", () => {
  const header = read("app/components/app-header.tsx");
  const summary = header.slice(header.indexOf('aria-label="Open account menu"'), header.indexOf("</summary>"));
  assert.doesNotMatch(summary, /rounded-full bg-\[var\(--action-primary\)\]/);
  assert.doesNotMatch(header, /account-dot|notification-dot|unread-dot/);
});

test("homepage explicitly preserves anonymous, no-pet, and with-pet actions", () => {
  const homepage = read("app/components/homepage-client.tsx");
  assert.match(homepage, /showSignIn=\{visibleMode === "anonymous"\}/);
  assert.match(homepage, /mode === "anonymous"[\s\S]*href: NEW_PET_LOGIN_PATH, label: "Get started"/);
  assert.match(homepage, /mode === "no-pets"[\s\S]*href: NEW_PET_ONBOARDING_PATH, label: "Add your pet"/);
  assert.match(homepage, /href: "\/today", label: "Go to Today"/);
  assert.match(homepage, /auth\.status === "loading"[\s\S]*"loading"/);
});

test("signed-in homepage branches do not render signed-out actions", () => {
  const homepage = read("app/components/homepage-client.tsx");
  assert.match(homepage, /<MarketingFooter showSignIn=\{visibleMode === "anonymous"\} signedIn=\{signedIn\} \/>/);
  assert.match(homepage, /signedIn \? <Link[\s\S]*href="\/account">Account/);
});

test("action labels follow account-state conventions", () => {
  const copy = read("app/lib/action-copy.ts");
  const pets = read("app/pets/page.tsx");
  assert.match(copy, /addPet: "Add pet"/);
  assert.match(copy, /addYourPet: "Add your pet"/);
  assert.match(copy, /addYourFirstPet: "Add your first pet"/);
  assert.match(pets, />[\s\S]*ADD PET[\s\S]*<\/Link>/);
  assert.doesNotMatch(pets, />Add a pet</);
});

test("homepage keeps product discovery inside the application", () => {
  const homepage = read("app/components/homepage-client.tsx");
  assert.doesNotMatch(homepage, /Illustrative|Mani|ProductWindow|product-frame|Vet Visit Brief/);
  assert.match(homepage, /ONE STORY\.[\s\S]*NOT A PILE OF NOTES\./);
});

test("Ask localizes recent-conversation loading failures", () => {
  const ask = read("app/ask/page.tsx");
  assert.match(ask, /fetchConversationList\(\)\.catch\(\(\) => \{[\s\S]*setConversationListError\("Recent conversations could not be loaded\. Try again\."\)/);
  assert.match(ask, /<RecentConversations[\s\S]*error=\{conversationListError\}[\s\S]*onRetry/);
  assert.doesNotMatch(ask, /Get practical guidance using|profile, recent notes/);
});

test("Pets, History, and Today keep focused empty and primary states", () => {
  const pets = read("app/pets/page.tsx");
  const history = read("app/components/care-log-workspace.tsx");
  const today = read("app/today/page.tsx");
  assert.match(pets, /No pets here yet\./);
  assert.match(pets, /Start with the pet you want Furvise to remember\./);
  assert.match(pets, /ADD YOUR PET/);
  assert.doesNotMatch(pets, /Add update|Ask about|Vet brief/);
  assert.match(history, /Start \$\{emptyHistoryName\}'s history/);
  assert.match(history, /Start your pets' history/);
  assert.match(history, /Add first update[\s\S]*Ask about/);
  assert.match(today, /disabled=\{!rememberDraft \|\| rememberSaving\}[\s\S]*"REMEMBER"/);
  assert.match(today, /placeholder=\{TODAY_REMEMBER_EXAMPLES\[exampleIndex\]\}/);
  assert.match(today, /<span>Category<\/span>[\s\S]*<span>When<\/span>/);
  assert.doesNotMatch(today, /ASK ABOUT|Full story/);
  assert.match(today, /createCareEntry\(/);
});

test("homepage footer follows authentication state", () => {
  const homepage = read("app/components/homepage-client.tsx");
  const footer = homepage.slice(homepage.indexOf("function MarketingFooter"), homepage.indexOf("function HomepageMobileNavigation"));
  assert.match(footer, /data-ui="homepage-marketing-footer"/);
  assert.match(footer, /href="\/privacy">Privacy/);
  assert.match(footer, /href="\/terms">Terms/);
  assert.match(homepage, /showSignIn=\{visibleMode === "anonymous"\}/);
  assert.equal(footer.split('href="/login">Sign in</Link>').length - 1, 1);
});

test("primary UI source contains no banned mechanics copy or em dash and uses the unified AI-credit label", () => {
  const files = appFiles().filter((file) => file.endsWith(".tsx"));
  const source = files.map(read).join("\n");
  for (const phrase of [
    "Get practical guidance using",
    "current curated collection using",
    "Checking saved context",
    "information already in front of you",
    "context loading",
    "context use",
  ]) assert.doesNotMatch(source, new RegExp(phrase, "i"));
  assert.doesNotMatch(source, /—/);
  assert.match(source, /AI credit/);
});
