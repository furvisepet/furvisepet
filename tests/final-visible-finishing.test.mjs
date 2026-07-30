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
const today = read("app/dashboard/page.tsx");

test("Login uses the restrained account-access layout and removes the old benefit presentation", () => {
  assert.match(login, /title=\{mode === "signin" \? "Welcome back"/);
  assert.match(login, /Sign in to continue caring for your pets\./);
  assert.match(login, /New to Furvise\? Create account/);
  assert.match(login, /Your pets, notes, conversations, and Vet Visit Briefs stay private to your account\./);
  for (const old of ["Your pet family care companion", "trustPoints", "Keep your pet's care history connected", "role=\"tablist\""]) assert.doesNotMatch(login, new RegExp(old, "i"));
});

test("all account flows remain wired through the shared access shell", () => {
  assert.match(login, /fetch\(endpoint, init\)/);
  assert.match(login, /endpoint = mode === "signin" \? "\/api\/auth\/login" : "\/api\/auth\/signup"/);
  assert.match(login, /Keep me signed in/);
  assert.match(login, /href="\/forgot-password"/);
  assert.match(forgot, /"\/api\/auth\/recovery"/);
  assert.match(update, /exchangeCodeForSession|setSession/);
  assert.match(update, /fetch\("\/api\/auth\/update-password"/);
  for (const source of [login, forgot, update]) assert.match(source, /AccountAccessLayout/);
});

test("authenticated homepage and application use the same primary navigation", () => {
  const primary = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  for (const destination of ["Today", "Pets", "History", "Ask", "Products"]) assert.match(primary, new RegExp(`label: "${destination}"`));
  assert.match(homepage, /<SignedInHeader variant="homepage" \/>/);
  assert.match(header, /resolvedAuthState === "authenticated" \? APP_NAV_ITEMS/);
  assert.doesNotMatch(header, />Appearance<|openAppearance/);
  assert.match(header, />Account</);
});

test("Products is a normal feature location and not an Account action", () => {
  assert.doesNotMatch(signedHeader, /href: "\/shop"|Browse products/);
  assert.match(header, /href: "\/shop", label: "Products"/);
  assert.match(header, />More<[\s\S]*href="\/shop"[\s\S]*>Products</);
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

test("Ask starter rows advertise selection without becoming cards", () => {
  assert.match(ask, /data-ui="starter-question"/);
  assert.match(ask, /min-h-14[\s\S]*cursor-pointer[\s\S]*hover:bg-\[var\(--selection\)\][\s\S]*focus-visible:ring-2/);
  assert.match(ask, /group-hover:translate-x-0\.5/);
  assert.doesNotMatch(ask.slice(ask.indexOf("function EmptyConversation"), ask.indexOf("function UserMessage")), /rounded-2xl|shadow-/);
});

test("functional workspaces use deliberate semantic surfaces", () => {
  assert.match(ask, /bg-\[var\(--surface-primary\)\][\s\S]*shadow-\[var\(--shadow-surface-2\)\]/);
  assert.match(today, /rounded-2xl border border-\[var\(--line\)\] bg-\[var\(--surface-interactive\)\]/);
  assert.match(history, /bg-\[var\(--surface-interactive\)\][\s\S]*Add first update/);
  assert.match(products, /rounded-2xl border border-\[var\(--line\)\] bg-\[var\(--surface-primary\)\]/);
});

test("homepage tells each benefit once and keeps pet-aware actions", () => {
  for (const benefit of ["Remember what changed", "Ask when you are unsure", "Prepare for the vet"]) assert.equal(homepage.split(benefit).length - 1, 1);
  assert.doesNotMatch(homepage, />0[123]</);
  assert.match(homepage, /Ask about \{petName\}/);
  assert.match(homepage, /Go to Today/);
});

test("BrandMark keeps the canonical source without generated theme variants", () => {
  const brand = read("app/components/brand-mark.tsx");
  assert.match(brand, /FURVISE_BRAND_ASSET = "\/brand\/logo\.png"/);
  assert.doesNotMatch(brand, /furvise-mark-light|furvise-mark-dark/);
  assert.match(brand, /height=\{showName \? 1024 : 1254\}[\s\S]*objectFit: "contain"[\s\S]*width=\{showName \? 1536 : 1254\}/);
  assert.match(brand, /alt=\{showName \? "Furvise" : ""\}/);
  assert.match(brand, /size = 30/);
});

test("primary visible sources use the approved AI-credit label and contain no em dash", () => {
  const source = [login, forgot, update, header, homepage, history, pets, ask, products, today].join("\n");
  assert.doesNotMatch(source, /—/);
  assert.match(source, /AI credit/);
});
