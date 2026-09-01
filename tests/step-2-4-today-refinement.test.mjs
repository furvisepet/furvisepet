import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const today = read("app/dashboard/page.tsx");
const css = read("app/dashboard/today-v2.module.css");

test("Today details are progressive instead of a visible category wall", () => {
  assert.match(today, />Add details<\/button>/);
  assert.match(today, /detailsOpen \? \([\s\S]*CARE_ENTRY_CATEGORIES\.map/);
  assert.match(today, /data-ui="today-v2-details"/);
  assert.doesNotMatch(today, /TODAY_EVENT_ACTIONS\.map|today-quick-update-grid|Choose a category/);
});

test("existing owner-device photo behavior stays available quietly", () => {
  assert.match(today, />\{rememberPhoto \? "Photo added" : "Add photo"\}<\/button>/);
  assert.match(today, /readPhotoFile\(file\)/);
  assert.match(today, /saveLocalPhoto\("care", entry\.id, rememberPhoto\)/);
  assert.doesNotMatch(today, /photo_url|storage\.from|upload\(/);
});

test("continuous layout is centered, card-free, and mobile reachable", () => {
  assert.match(css, /\.page \{[\s\S]*max-width: 52rem;[\s\S]*margin-inline: auto/);
  assert.match(css, /\.liveEdge \{[\s\S]*border-top: 1px solid var\(--border-subtle\)/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(read("app/components/app-page.tsx"), /app-mobile-nav-clearance/);
  assert.doesNotMatch(css, /shadow-surface|shadow-floating|border-radius: var\(--radius-lg\)|border-radius: var\(--radius-xl\)/);
});

test("Today controls meet mobile touch and overflow requirements", () => {
  assert.match(css, /\.primaryAction \{[\s\S]*min-height: 2\.75rem/);
  assert.match(css, /\.quietAction \{[\s\S]*min-height: 2\.75rem/);
  assert.match(css, /\.rememberInput,[\s\S]*width: 100%/);
  assert.match(css, /\.details select,[\s\S]*min-width: 0/);
});
