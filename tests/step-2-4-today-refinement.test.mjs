import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const today = read("app/today/page.tsx");
const css = read("app/today/today.module.css");

test("category and occurrence time are always-visible production fields", () => {
  assert.match(today, /<span>Category<\/span>[\s\S]*CARE_ENTRY_CATEGORIES\.map/);
  assert.match(today, /<span>When<\/span>[\s\S]*type="datetime-local"/);
  assert.match(today, /category: rememberCategory/);
  assert.match(today, /occurredAt: rememberOccurredAt/);
  assert.doesNotMatch(today, /detailsOpen|Add details|<details/);
});

test("Today contains no photo or Ask handoff surface", () => {
  assert.doesNotMatch(today, /rememberPhoto|Add photo|Photo added|readPhotoFile|saveLocalPhoto|type="file"/);
  assert.doesNotMatch(today, /ASK ABOUT|askDraft|persistAskDraft|\/ask\?pet=/);
});

test("continuous layout is wide, line-based, and mobile reachable", () => {
  assert.match(css, /\.page \{[\s\S]*max-width: 64rem;[\s\S]*margin-inline: auto/);
  assert.match(css, /\.recent \{[\s\S]*border-top: 1px solid var\(--today-line-strong\)/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(read("app/components/app-page.tsx"), /app-mobile-nav-clearance/);
  assert.doesNotMatch(css, /shadow-surface|shadow-floating/);
});

test("Today controls meet touch and overflow requirements", () => {
  assert.match(css, /\.primaryAction \{[\s\S]*min-height: 2\.75rem/);
  assert.match(css, /\.rememberInput \{[\s\S]*width: 100%/);
  assert.match(css, /\.metadataFields select,[\s\S]*min-width: 0/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*\.metadataFields \{[\s\S]*grid-template-columns: 1fr/);
});
