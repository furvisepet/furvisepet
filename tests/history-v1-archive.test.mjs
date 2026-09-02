import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatHistoryTimestamp,
  getHistoryFromInstant,
  HISTORY_PAGE_SIZE,
  normalizeHistorySearch,
} from "../app/lib/history-archive.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const archive = read("app/components/history-archive.tsx");
const data = read("app/lib/supabase.ts");
const header = read("app/components/app-header.tsx");

test("global History is a read-only archive without duplicated product jobs", () => {
  assert.match(archive, /HISTORY/);
  assert.match(archive, /Find anything you&apos;ve saved about your pets\./);
  assert.match(archive, /Search history\.\.\./);
  for (const forbidden of ["Add update", "Add first update", "Ask about", "Prepare vet brief", "Prepare care summary"]) {
    assert.doesNotMatch(archive, new RegExp(forbidden, "i"));
  }
  assert.doesNotMatch(archive, /CareEntryForm|createCareEntry|removeCareEntryFromHistory|orange/i);
});

test("search and filters are applied to the owner-scoped query before pagination", () => {
  assert.equal(HISTORY_PAGE_SIZE, 50);
  assert.match(data, /queryHistoryArchive[\s\S]*\.eq\("user_id", user\.id\)[\s\S]*\.is\("deleted_at", null\)/);
  assert.match(data, /queryHistoryArchive[\s\S]*\.eq\("pet_profile_id", input\.petId\)/);
  assert.match(data, /queryHistoryArchive[\s\S]*\.eq\("category", input\.category\)/);
  assert.match(data, /queryHistoryArchive[\s\S]*\.gte\("occurred_at", input\.from\)/);
  assert.match(data, /\.or\(`note\.ilike\.\%\$\{search\}\%,title\.ilike\.\%\$\{search\}%`\)/);
  assert.ok(data.indexOf('.or(`note.ilike.') < data.indexOf('.range(offset, offset + limit)'));
  assert.match(data, /\.order\("occurred_at", \{ ascending: false \}\)[\s\S]*\.order\("created_at", \{ ascending: false \}\)[\s\S]*\.range\(offset, offset \+ limit\)/);
  assert.match(archive, /LOAD OLDER/);
  assert.match(archive, /offset: nextOffset/);
});

test("History offers the exact V1 filters and honest empty states", () => {
  for (const copy of ["All pets", "All categories", "All time", "Last 7 days", "Last 30 days", "This year", "No history yet.", "Things you save in Today will appear here.", "Nothing matches that search.", "Clear filters"]) {
    assert.match(archive, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(archive, /data-ui="history-desktop-results"/);
  assert.match(archive, /grid-cols-\[12rem_10rem_minmax\(0,1fr\)_9rem\]/);
  assert.match(archive, /data-ui="history-mobile-results"/);
  assert.match(archive, /break-words/);
  assert.doesNotMatch(archive, /rounded-3xl|shadow-\[0_8px|category pill/i);
});

test("History controls use the neutral product input surface instead of mint", () => {
  const controls = archive.slice(archive.indexOf("const controlClass"), archive.indexOf("export function HistoryArchive"));
  assert.match(controls, /bg-\[var\(--input-background\)\]/);
  assert.match(controls, /border-\[var\(--input-border\)\]/);
  assert.match(controls, /focus-visible:border-\[var\(--forest\)\]/);
  assert.doesNotMatch(controls, /surface-interactive|pale-sage|soft-sage|orange/i);
});

test("History search normalization is bounded and removes PostgREST filter syntax", () => {
  assert.equal(normalizeHistorySearch("  Chicken, (left paw).*  "), "Chicken left paw");
  assert.equal(normalizeHistorySearch("a".repeat(200)).length, 120);
});

test("date filters use real instants and History preserves browser-local wall clock formatting", (context) => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  context.after(() => {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  });
  const now = new Date("2026-09-01T12:00:00-07:00");
  assert.equal(getHistoryFromInstant("year", now), "2026-01-01T08:00:00.000Z");
  assert.equal(getHistoryFromInstant("7d", now), "2026-08-25T19:00:00.000Z");
  const formatted = formatHistoryTimestamp("2026-09-01T07:15:00.000Z", "en-US");
  assert.match(formatted, /Sep 1, 2026/);
  assert.match(formatted, /12:15 AM/);
});

test("desktop navigation remains ordered while mobile Account stays in the top-right menu only", () => {
  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  assert.match(desktop, /\/today[\s\S]*\/pets[\s\S]*\/history[\s\S]*\/ask/);
  const dock = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  assert.match(dock, /grid-cols-4/);
  assert.doesNotMatch(dock, /label: "Account"|href: "\/account"/);
  assert.match(header, /data-ui="mobile-more-container"[\s\S]*NAVIGATION_ICON_ASSETS\.more/);
});
