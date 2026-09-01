import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const appPage = read("app/components/app-page.tsx");
const primitives = read("app/components/product-primitives.tsx");
const header = read("app/components/app-header.tsx");
const today = read("app/dashboard/page.tsx");
const pets = read("app/pets/page.tsx");
const history = read("app/components/care-log-workspace.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const homepage = read("app/components/homepage-client.tsx");
const vetBrief = read("app/vet-brief/page.tsx");

test("shared focused and workspace layouts use semantic outer application shells", () => {
  assert.match(primitives, /export const pageShellClasses/);
  for (const preset of ["reading", "standard", "wide", "marketing"]) assert.match(primitives, new RegExp(`${preset}: "max-w-`));
  assert.match(primitives, /export const focusedLayout/);
  assert.match(primitives, /export const workspaceLayout/);
  assert.match(appPage, /layout\?: "focused" \| "workspace"/);
  assert.match(ask, /<AppPage layout="focused"/);
  assert.match(products, /<AppPage layout="focused"/);
  assert.match(vetBrief, /<AppPage layout="focused"/);
  assert.match(today, /<AppPage layout="workspace"/);
  assert.match(pets, /<AppPage layout="workspace"/);
  assert.match(history, /<AppPage layout="workspace"/);
});

test("Today keeps profile completion out of the present-tense file", () => {
  assert.match(today, /data-ui="today-v2-file"/);
  assert.match(today, /Nothing on the file yet\./);
  assert.match(today, /When something matters, put it here\./);
  assert.doesNotMatch(today, /Monthly care budget|profile checklist|Ingredients to avoid|Complete profile/);
});

test("Pets shows each care goal once and adds useful one-pet depth", () => {
  assert.equal(pets.split("Care goal").length - 1, 1);
  assert.doesNotMatch(pets, /General wellness/);
  assert.match(pets, /Start \{name\}&apos;s care history/);
  assert.match(pets, /Latest conversation/);
});

test("empty History hides low-value controls and gives the timeline a first action", () => {
  assert.match(history, /briefPetId && entries\.length/);
  assert.match(history, /!isPetScope && entries\.length/);
  assert.match(history, /Start \$\{emptyHistoryName\}'s history/);
  assert.match(history, /Add first update/);
});

test("Ask fresh state keeps starters and composer together without a redundant primary action", () => {
  assert.match(ask, /thread\.length \|\| requestActive \? "sm:min-h-\[66vh\]" : ""/);
  assert.match(ask, /activeConversationId \|\| thread\.length \? <button className=\{secondaryButton\}[\s\S]*New question/);
  assert.match(ask, /<EmptyConversation[\s\S]*<Composer/);
  assert.match(ask, /data-ui="starter-question"[\s\S]*focus-visible:ring-2/);
  assert.match(ask, /Recent conversations could not be loaded\. Try again\./);
  assert.doesNotMatch(ask, /Your history is temporarily unavailable\. You can still ask a question\./);
});

test("homepage ends with the final conversion section", () => {
  const renderedHomepage = homepage.slice(homepage.indexOf("export function HomepageClient"), homepage.indexOf("function PublicMarketingHeader"));
  assert.match(homepage, /aria-label="Remember what matters\."/);
  assert.match(homepage, /You don&apos;t need to remember everything on day one\. Just start\./);
  assert.ok(renderedHomepage.indexOf("<FinalChapter") < renderedHomepage.indexOf("<MarketingFooter"));
  assert.match(homepage, /<MarketingFooter showSignIn=\{visibleMode === "anonymous"\} signedIn=\{signedIn\} \/>/);
});

test("primary user-facing surfaces contain no em dash or visible technical positioning", () => {
  const source = [homepage, today, pets, history, ask, products, vetBrief, header].join("\n");
  assert.doesNotMatch(source, /—/);
  for (const phrase of ["powered by AI", "artificial intelligence", "language model", "saved data analysis"]) {
    assert.doesNotMatch(source, new RegExp(phrase, "i"));
  }
});
