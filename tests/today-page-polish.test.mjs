import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const today = read("app/today/page.tsx");
const legacyDashboard = read("app/dashboard/page.tsx");
const css = read("app/today/today.module.css");

test("Today V3 is the canonical present-tense file", () => {
  assert.match(today, /data-ui="today-present-file"/);
  assert.match(today, /formatTodayPetContext\(selectedProfile\)/);
  assert.match(today, /Anything you want Furvise to remember\?/);
  assert.match(today, /data-ui="today-remember-composer"[\s\S]*data-ui="today-recent"/);
  assert.match(today, /Nothing on the file yet\.[\s\S]*When something matters, put it here\./);
  assert.doesNotMatch(today, />TODAY<|className=\{styles\.todayTitle\}/);
});

test("legacy dashboard links permanently preserve query parameters", () => {
  assert.match(legacyDashboard, /const legacyParams = await searchParams/);
  assert.match(legacyDashboard, /Object\.entries\(legacyParams\)/);
  assert.match(legacyDashboard, /permanentRedirect\(nextParams\.size \? `\/today\?\$\{nextParams\.toString\(\)\}` : "\/today"\)/);
});

test("Today removes duplicate workflows and old dashboard clutter", () => {
  for (const removed of ["Furvise is getting to know", "Monthly care budget", "Ingredients to avoid", "Complete profile", "Everything seems normal", "Add details", "Add photo", "ASK ABOUT", "Full story"]) {
    assert.doesNotMatch(today, new RegExp(removed, "i"));
  }
  assert.doesNotMatch(today, /placeholder="What happened\?"/i);
  assert.doesNotMatch(today, /readPhotoFile|saveLocalPhoto|persistAskDraft|warm-orange|TODAY_EVENT_ACTIONS\.map/);
  assert.doesNotMatch(today, /<EmptyState/);
});

test("Remember reuses one authoritative write and stays on Today", () => {
  const handlerStart = today.indexOf("async function saveRememberedNote");
  const handler = today.slice(handlerStart, today.indexOf("\n  return (\n", handlerStart));
  assert.equal((handler.match(/createCareEntry\(/g) || []).length, 1);
  assert.match(handler, /await createCareEntry\([\s\S]*setEntries\([\s\S]*setRememberNote\(""\)[\s\S]*setRememberCategory\("general"\)[\s\S]*setRememberOccurredAt\(toLocalDateTimeInputValue\(\)\)/);
  assert.doesNotMatch(handler, /location\.|router\.|redirect/);
});

test("Today is a restrained, responsive file rather than a card dashboard", () => {
  assert.match(css, /\.page \{[\s\S]*max-width: 64rem;[\s\S]*margin-inline: auto/);
  assert.match(css, /\.primaryAction \{[\s\S]*background: var\(--deep-forest\);[\s\S]*color: var\(--warm-cream\)/);
  assert.match(css, /\.recentTable \{[\s\S]*border-collapse: collapse/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*\.recentTable tr \{[\s\S]*display: grid/);
  assert.doesNotMatch(css, /shadow-surface|shadow-floating|border-radius: var\(--radius-lg\)|border-radius: var\(--radius-xl\)/);
  assert.doesNotMatch(`${today}\n${css}`, /heron|flamingo|hummingbird|gradient|â€”|Â·/);
});
