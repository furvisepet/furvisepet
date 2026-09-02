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
  assert.doesNotMatch(today, /Nothing on the file yet|When something matters, put it here/);
  assert.match(today, /eyebrow="TODAY"/);
  assert.doesNotMatch(today, /className=\{styles\.todayTitle\}/);
});

test("legacy dashboard links permanently preserve query parameters", () => {
  assert.match(legacyDashboard, /const legacyParams = await searchParams/);
  assert.match(legacyDashboard, /Object\.entries\(legacyParams\)/);
  assert.match(legacyDashboard, /permanentRedirect\(nextParams\.size \? `\/today\?\$\{nextParams\.toString\(\)\}` : "\/today"\)/);
});

test("Today removes duplicate workflows and old dashboard clutter", () => {
  for (const removed of ["Furvise is getting to know", "Monthly care budget", "Ingredients to avoid", "Complete profile", "Everything seems normal", "Add photo", "ASK ABOUT", "Full story"]) {
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
  assert.match(handler, /await createCareEntry\([\s\S]*prependConfirmedTodayEntry\([\s\S]*setRememberNote\(""\)[\s\S]*setRememberCategory\("general"\)[\s\S]*setRememberOccurredAt\(toLocalDateTimeInputValue\(\)\)/);
  assert.doesNotMatch(handler, /location\.|router\.|redirect/);
});

test("Today is a restrained, responsive file rather than a card dashboard", () => {
  assert.match(css, /\.page \{[\s\S]*width: 100%/);
  assert.doesNotMatch(css, /max-width: 64rem|margin-inline: auto/);
  assert.match(css, /\.primaryAction \{[\s\S]*background: var\(--today-action-background\);[\s\S]*color: var\(--today-action-foreground\)/);
  assert.match(read("app/components/app-page.tsx"), /data-app-canvas=\{shell\}/);
  assert.match(read("app/globals.css"), /\[data-app-canvas="today"\] \{[\s\S]*background: var\(--today-canvas\)/);
  assert.match(css, /\.recentList \{[\s\S]*list-style: none/);
  assert.match(css, /\.recentNote \{[\s\S]*overflow-wrap: anywhere/);
  assert.doesNotMatch(today, /<table|<thead|<th/);
  assert.doesNotMatch(css, /shadow-surface|shadow-floating|border-radius: var\(--radius-lg\)|border-radius: var\(--radius-xl\)/);
  assert.doesNotMatch(`${today}\n${css}`, /heron|flamingo|hummingbird|gradient|â€”|Â·/);
});
