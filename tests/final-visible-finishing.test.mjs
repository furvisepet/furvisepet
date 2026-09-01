import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const forgot = read("app/forgot-password/page.tsx");
const update = read("app/update-password/page.tsx");
const header = read("app/components/app-header.tsx");
const signedHeader = read("app/components/signed-in-header.tsx");
const homepage = read("app/components/homepage-client.tsx");
const primitives = read("app/components/product-primitives.tsx");
const history = read("app/components/care-log-workspace.tsx");
const pets = read("app/pets/page.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const today = read("app/today/page.tsx");

test("Login uses the restrained account-access layout and removes the old benefit presentation", () => {
  assert.match(login, /const signinTitle = signinStep === "method" \? "Welcome back" : "Enter your password"/);
  assert.doesNotMatch(login, /Sign in to pick up where you left off\./);
  assert.match(login, /New to Furvise\? Create account/);
  for (const old of ["Your pet family care companion", "trustPoints", "Keep your pet's care history connected", "Your pets, notes, conversations, and Vet Visit Briefs stay private to your account.", "role=\"tablist\""]) assert.doesNotMatch(login, new RegExp(old.replace(/[.?]/g, "\\$&"), "i"));
});

test("all account flows remain wired through the shared access shell", () => {
  assert.match(login, /fetch\(endpoint, init\)/);
  assert.match(login, /endpoint = mode === "signin" \? "\/api\/auth\/login" : "\/api\/auth\/signup"/);
  assert.doesNotMatch(login, /Keep me signed in|keepSignedIn|setKeepSignedIn/);
  assert.match(login, /href="\/forgot-password"/);
  assert.match(forgot, /"\/api\/auth\/recovery"/);
  assert.match(update, /getSession\(\)/);
  assert.match(update, /fetch\("\/api\/auth\/update-password"/);
  for (const source of [login, forgot, update]) assert.match(source, /AccountAccessLayout/);
});

test("application navigation stays intact while the homepage uses plain signed-in links", () => {
  const primary = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  for (const destination of ["Today", "Pets", "History", "Ask"]) assert.match(primary, new RegExp(`label: "${destination}"`));
  assert.doesNotMatch(primary, /Products|\/shop/);
  assert.doesNotMatch(homepage, /SignedInHeader|AppHeader|APP_NAV_ITEMS/);
  assert.match(homepage, /<PublicMarketingHeader mode=\{mode\} \/>/);
  assert.match(homepage, /HOMEPAGE_DESKTOP_NAVIGATION[\s\S]*Today[\s\S]*Pets[\s\S]*History[\s\S]*Ask/);
  assert.doesNotMatch(homepage.slice(homepage.indexOf("const HOMEPAGE_DESKTOP_NAVIGATION"), homepage.indexOf("const HOMEPAGE_MOBILE_NAVIGATION")), /Products/);
  assert.match(header, /resolvedAuthState === "authenticated" \? APP_NAV_ITEMS/);
  assert.doesNotMatch(header, />Appearance<|openAppearance/);
  assert.match(header, />Account</);
});

test("Products remains a feature location without appearing in primary navigation or Account", () => {
  assert.doesNotMatch(signedHeader, /href: "\/shop"|Browse products/);
  assert.doesNotMatch(header, /href: "\/shop", label: "Products"|href="\/shop"[\s\S]*>Products/);
  assert.match(products, /export default function ShopPage/);
});

test("History keeps one empty-state primary while repeated Pets updates are soft", () => {
  const historyEmpty = history.slice(history.indexOf('entries.length === 0'), history.indexOf('visibleEntries.length === 0'));
  assert.equal(historyEmpty.split("<PrimaryButton").length - 1, 1);
  assert.equal(historyEmpty.split("<SecondaryButton").length - 1, 1);
  assert.match(historyEmpty, /Add first update[\s\S]*Ask about/);
  const petEmpty = pets.slice(pets.indexOf("function PetStartHistory"), pets.indexOf("function PetHistoryDepth"));
  assert.equal(petEmpty.split("<SoftButton").length - 1, 1);
  assert.equal(petEmpty.split("<SecondaryButton").length - 1, 1);
  assert.match(petEmpty, /Add update[\s\S]*Ask about \{name\}/);
});

test("shared text actions have minimum targets and visible hover and focus treatment", () => {
  assert.match(primitives, /export function TextAction/);
  assert.match(primitives, /data-ui="text-action"/);
  assert.match(primitives, /min-h-12[\s\S]*hover:bg-\[var\(--ghost-action-hover\)\][\s\S]*focus-visible:ring-2/);
  assert.match(pets, /<TextAction arrow href=\{`\/pets\/\$\{profile\.id\}`\}>Open profile<\/TextAction>/);
});

test("Ask starter drafts advertise selection as compact, unfussy cards", () => {
  assert.match(ask, /data-ui="starter-question"/);
  assert.match(ask, /min-h-11[\s\S]*cursor-pointer[\s\S]*hover:bg-\[var\(--suggested-question-hover\)\][\s\S]*focus-visible:ring-2/);
  assert.match(ask, /group-hover:translate-x-0\.5/);
  assert.match(ask.slice(ask.indexOf("function EmptyConversation"), ask.indexOf("function UserMessage")), /rounded-lg/);
  assert.doesNotMatch(ask.slice(ask.indexOf("function EmptyConversation"), ask.indexOf("function UserMessage")), /rounded-2xl|shadow-/);
});

test("homepage tells each company-story chapter once and keeps authenticated actions", () => {
  for (const benefit of ["PETS CHANGE.", "ONE STORY.", "WHEN YOU NEED IT,", "YOUR PET&apos;S STORY", "START WITH"]) assert.equal(homepage.split(benefit).length - 1, 1);
  assert.match(homepage, /secondaryCopy="You don't have to track everything\. Use Furvise when something matters\."/);
  assert.doesNotMatch(homepage, /id="track-less"/);
  assert.doesNotMatch(homepage, />0[123]</);
  assert.doesNotMatch(homepage, /Mani|Illustrative example/);
  assert.match(homepage, /Go to Today/);
});

test("BrandMark keeps the canonical source without generated theme variants", () => {
  const brand = read("app/components/brand-mark.tsx");
  const namedMark = brand.slice(brand.indexOf("if (showName)"), brand.lastIndexOf("\n  return ("));
  const iconOnlyMark = brand.slice(brand.lastIndexOf("\n  return ("));
  assert.match(brand, /FURVISE_BRAND_ASSET = "\/brand\/furvise-logo\.svg"/);
  assert.doesNotMatch(brand, /furvise-mark-light|furvise-mark-dark/);
  assert.match(brand, /FURVISE_WORDMARK_ASSET = "\/brand\/furvise-wordmark\.svg"/);
  assert.match(brand, /FURVISE_MASCOT_ASSET = "\/brand\/furvise-heron\.svg"/);
  assert.ok(namedMark.indexOf("src={FURVISE_WORDMARK_ASSET}") < namedMark.indexOf("src={FURVISE_MASCOT_ASSET}"));
  assert.match(namedMark, /columnGap: "6px"/);
  assert.match(namedMark, /alt="Furvise"[\s\S]*objectFit: "contain"/);
  assert.match(namedMark, /alt=""[\s\S]*aria-hidden="true"[\s\S]*src=\{FURVISE_MASCOT_ASSET\}/);
  assert.match(iconOnlyMark, /alt=""[\s\S]*aria-hidden="true"[\s\S]*height: responsiveSize[\s\S]*width: responsiveSize/);
  assert.match(brand, /size = 30/);
});

test("primary visible sources use the approved AI-credit label and contain no em dash", () => {
  const source = [login, forgot, update, header, homepage, history, pets, ask, products, today].join("\n");
  assert.doesNotMatch(source, /—/);
  assert.match(source, /AI credit/);
});
