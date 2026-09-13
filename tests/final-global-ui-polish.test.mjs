import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const css = read("app/globals.css");
const primitives = read("app/components/product-primitives.tsx");
const appPage = read("app/components/app-page.tsx");

test("normal app pages use one Barlow Condensed display system and one product rail", () => {
  assert.match(read("app/layout.tsx"), /Barlow_Condensed[\s\S]*variable: "--font-marketing-display"[\s\S]*weight: "700"/);
  assert.match(primitives, /appPageEyebrowClass = "app-page-eyebrow"/);
  assert.match(primitives, /appPageTitleClass = "app-page-title"/);
  assert.match(primitives, /appPageSubtitleClass = "app-page-subtitle"/);
  assert.match(primitives, /appSectionTitleClass = "app-section-title"/);
  assert.match(primitives, /appPageContainer = "box-border mx-auto w-\[calc\(100%_-_2\.5rem\)\] max-w-\[1180px\] sm:w-\[calc\(100%_-_4rem\)\] lg:w-\[calc\(100%_-_6rem\)\]"/);
  assert.match(appPage, /pt-8 sm:pt-12 lg:pt-16/);
  assert.match(css, /\.app-page-title \{[\s\S]*font-family: var\(--font-marketing-display\), "Arial Narrow", Arial, sans-serif;[\s\S]*font-size: clamp\(2\.5rem, 10vw, 3\.25rem\);[\s\S]*font-weight: 700;[\s\S]*line-height: 1;[\s\S]*letter-spacing: -0\.018em/);
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*\.app-page-title \{[\s\S]*font-size: clamp\(3rem, 3\.6vw, 4rem\);[\s\S]*line-height: 0\.98/);
  assert.match(css, /\.app-page-subtitle \{[\s\S]*line-height: 1\.55/);
  assert.match(css, /\.app-section-title \{[\s\S]*font-family: var\(--font-marketing-display\)/);
});

test("the explicit V1 page orientation and task copy is present without changing routes", () => {
  const pages = {
    today: read("app/today/page.tsx"),
    pets: read("app/pets/page.tsx"),
    history: read("app/components/history-archive.tsx"),
    ask: read("app/ask/page.tsx"),
    pet: read("app/pets/[id]/page.tsx"),
    edit: read("app/dogs/[id]/edit/page.tsx"),
    account: read("app/components/account-settings-shell.tsx"),
    membership: read("app/membership/page.tsx"),
  };

  assert.match(pages.today, /eyebrow="TODAY"[\s\S]*title="Anything you want Furvise to remember\?"/);
  assert.match(pages.today, /supportingText="Add a pet before starting their file\." title="Start with your pet"/);
  assert.match(pages.pets, /eyebrow="PETS"[\s\S]*supportingText="The pets Furvise remembers with you\."[\s\S]*title="Your pets"/);
  assert.match(pages.history, /eyebrow="HISTORY"[\s\S]*supportingText="Search across your pets and past updates\."[\s\S]*title="Find something you've saved\."/);
  assert.match(pages.ask, /eyebrow="ASK"[\s\S]*supportingText="Ask a question, tell Furvise what changed, or just share something that's on your mind\."[\s\S]*WHAT'S ON YOUR MIND ABOUT/);
  assert.match(pages.pet, /eyebrow="PETS"[\s\S]*supportingText=\{metadata\}[\s\S]*title=\{name\}/);
  assert.match(pages.edit, /eyebrow="PETS"[\s\S]*Change the details Furvise uses for \$\{petName\}\.[\s\S]*EDIT \$\{petName\.toUpperCase\(\)\}/);
  assert.match(pages.account, /eyebrow="ACCOUNT" supportingText="Manage your Furvise account\." title="ACCOUNT SETTINGS"/);
  assert.match(pages.membership, /eyebrow="ACCOUNT" supportingText="Choose the plan that fits how much Furvise you use\." title="MEMBERSHIP"/);

  for (const route of ["app/today/page.tsx", "app/pets/page.tsx", "app/history/page.tsx", "app/ask/page.tsx", "app/account/page.tsx", "app/membership/page.tsx"]) {
    assert.equal(existsSync(new URL(`../${route}`, import.meta.url)), true, `${route} remains present`);
  }
});

test("normal action, focus, button, and form semantics resolve to the forest system", () => {
  const scheme = css.slice(css.indexOf(":root"), css.indexOf("@theme inline"));
  assert.match(scheme, /--primary-action-background: var\(--deep-forest\);/);
  assert.match(scheme, /--primary-action-foreground: var\(--warm-cream\);/);
  assert.match(scheme, /--primary-action-hover: var\(--forest\);/);
  assert.match(scheme, /--focus-ring: var\(--forest\);/);
  assert.match(scheme, /--pw-accent: var\(--forest\);[\s\S]*--pw-accent-hover: var\(--deep-forest\);/);
  assert.doesNotMatch(scheme, /--(?:primary-action|pw-accent)(?:-[\w-]+)?: var\(--warm-orange/);
  assert.match(primitives, /buttonBaseClasses =[\s\S]*min-h-12[\s\S]*rounded-\[var\(--radius-sm\)\]/);
  assert.match(primitives, /fieldControlClass =[\s\S]*min-h-12[\s\S]*rounded-\[var\(--radius-sm\)\][\s\S]*bg-\[var\(--input-background\)\][\s\S]*focus:border-\[var\(--focus-ring\)\]/);
  const history = read("app/components/history-archive.tsx");
  const controls = history.slice(history.indexOf("const controlClass"), history.indexOf("export function HistoryArchive"));
  assert.match(controls, /bg-\[var\(--input-background\)\]/);
  assert.doesNotMatch(controls, /mint|pale-sage|soft-sage|warm-orange/i);
});

test("signed-in navigation and account utility remain structurally unchanged", () => {
  const header = read("app/components/app-header.tsx");
  const utility = read("app/components/account-utility.tsx");
  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  const mobile = header.slice(header.indexOf("const MOBILE_NAV_ITEMS"), header.indexOf("export function AppHeader"));
  for (const label of ["Today", "Pets", "History", "Ask"]) assert.match(desktop, new RegExp(`label: "${label}"`));
  assert.equal((mobile.match(/label: "/g) || []).length, 4);
  for (const label of ["Today", "History", "Ask", "Pets"]) assert.match(mobile, new RegExp(`label: "${label}"`));
  assert.doesNotMatch(mobile, /Account|Products/);
  assert.match(header, /<AccountUtility email=\{accountEmail\} \/>/);
  assert.match(utility, /data-ui="account-utility"[\s\S]*Account settings[\s\S]*Membership[\s\S]*Privacy[\s\S]*Terms[\s\S]*Sign out/);
});

test("favicon metadata and the manifest resolve every cream-background icon", async () => {
  const layout = read("app/layout.tsx");
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.background_color, "#F7F4E8");
  assert.equal(manifest.theme_color, "#123F27");
  for (const icon of ["favicon-16.png", "favicon-32.png", "favicon.ico", "apple-touch-icon.png", "android-192.png", "android-512.png", "maskable-icon-512.png"]) {
    assert.match(`${layout}\n${JSON.stringify(manifest)}`, new RegExp(icon.replace(".", "\\.")));
  }
  assert.equal(manifest.icons.find((icon) => icon.src === "/maskable-icon-512.png")?.purpose, "maskable");

  for (const icon of ["favicon-16.png", "favicon-32.png", "apple-touch-icon.png", "android-192.png", "android-512.png", "maskable-icon-512.png"]) {
    const source = readFileSync(new URL(`../public/${icon}`, import.meta.url));
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([...data.subarray(0, info.channels)], [247, 244, 232, 255], `${icon} has an opaque cream corner`);
  }
});
