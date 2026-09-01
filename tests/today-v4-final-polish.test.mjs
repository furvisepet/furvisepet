import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatCareEntryTime,
  prepareCareEntryInputForTransport,
  prepareCareEntryForInsert,
  toLocalDateTimeInputValue,
} from "../app/lib/care-log.mjs";
import { buildTodayRecentEntries, formatTodayTimelineDate, TODAY_REMEMBER_EXAMPLES } from "../app/lib/today.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/today/page.tsx");
const css = read("app/today/today.module.css");

test("Today hides optional details until the accessible disclosure is opened", () => {
  assert.match(page, /const \[detailsOpen, setDetailsOpen\] = useState\(false\)/);
  assert.match(page, /aria-controls="today-remember-details"[\s\S]*aria-expanded=\{detailsOpen\}/);
  assert.match(page, /\{detailsOpen \? \([\s\S]*id="today-remember-details"[\s\S]*<span>Category<\/span>[\s\S]*<span>When<\/span>/);
  assert.doesNotMatch(page, /<details|<dialog/);
});

test("collapsed Remember uses safe defaults and a successful save resets and closes details", () => {
  assert.match(page, /useState<CareEntryInput\["category"\]>\("general"\)/);
  assert.match(page, /useState\(\(\) => toLocalDateTimeInputValue\(\)\)/);
  assert.match(page, /createCareEntry\(\{[\s\S]*category: rememberCategory,[\s\S]*occurredAt: rememberOccurredAt/);
  assert.match(page, /setRememberNote\(""\)[\s\S]*setRememberCategory\("general"\)[\s\S]*setRememberOccurredAt\(toLocalDateTimeInputValue\(\)\)[\s\S]*setDetailsOpen\(false\)/);
});

test("Remember has an unmistakable cream enabled state and a quiet true disabled state", () => {
  assert.match(page, /disabled=\{!rememberDraft \|\| rememberSaving\}/);
  assert.match(css, /\.primaryAction \{[\s\S]*background: var\(--today-action-background\);[\s\S]*color: var\(--today-action-foreground\)/);
  assert.match(css, /\.primaryAction:disabled \{[\s\S]*background: var\(--today-disabled-background\);[\s\S]*color: var\(--today-disabled-foreground\)/);
  assert.doesNotMatch(`${page}\n${css}`, /orange|warm-orange/i);
});

test("Recent is a newest-first ten-entry file list with exact notes and no table headers", () => {
  const exactNote = "  we went to vet  ";
  const rows = Array.from({ length: 12 }, (_, index) => ({
    category: "general",
    id: String(index),
    intelligence_source_message_id: null,
    note: index === 11 ? exactNote : `note ${index}`,
    occurred_at: `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    pet_profile_id: "pet",
    title: "Note",
  }));
  const recent = buildTodayRecentEntries(rows, "pet");
  assert.equal(recent.length, 10);
  assert.deepEqual(recent.map(({ id }) => id), ["11", "10", "9", "8", "7", "6", "5", "4", "3", "2"]);
  assert.equal(recent[0].note, exactNote);
  assert.match(page, /<ol className=\{styles\.recentList\}>[\s\S]*<p className=\{styles\.recentNote\}>\{entry\.note\}<\/p>/);
  assert.doesNotMatch(page, /<table|<thead|<tbody|<th|scope="col"/);
});

test("generic examples never assume the selected pet's sex", () => {
  assert.equal(TODAY_REMEMBER_EXAMPLES.length, 10);
  for (const example of TODAY_REMEMBER_EXAMPLES) {
    assert.doesNotMatch(example, /\b(?:he|her|hers|him|his|she)\b/i);
    assert.doesNotMatch(example, /\bMilo\b/i);
  }
});

test("browser transport preserves Los Angeles wall-clock time through PDT and PST", () => {
  const priorTimezone = process.env.TZ;
  try {
    const cases = [
      { expectedIso: "2026-09-01T07:15:00.000Z", localInput: "2026-09-01T00:15", now: "2026-09-01T12:00:00-07:00" },
      { expectedIso: "2026-12-01T08:15:00.000Z", localInput: "2026-12-01T00:15", now: "2026-12-01T12:00:00-08:00" },
    ];

    for (const testCase of cases) {
      process.env.TZ = "America/Los_Angeles";
      const browserInput = prepareCareEntryInputForTransport({
        category: "general",
        note: "timezone round trip",
        occurredAt: testCase.localInput,
        petProfileId: "pet",
        severity: null,
        title: "Note",
      });
      assert.equal(browserInput.occurredAt, testCase.expectedIso);

      process.env.TZ = "UTC";
      const payload = prepareCareEntryForInsert(browserInput, "user");
      assert.equal(payload.occurred_at, testCase.expectedIso);

      process.env.TZ = "America/Los_Angeles";
      assert.equal(toLocalDateTimeInputValue(new Date(payload.occurred_at)), testCase.localInput);
      assert.equal(prepareCareEntryInputForTransport({ ...browserInput, occurredAt: testCase.localInput }).occurredAt, testCase.expectedIso);
      assert.equal(formatCareEntryTime(payload.occurred_at, "en-US"), "12:15 AM");
      assert.equal(formatTodayTimelineDate(payload.occurred_at, new Date(testCase.now)), "Today, 12:15 AM");
    }
  } finally {
    if (priorTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = priorTimezone;
  }
});

test("all browser care-entry create and edit gateways serialize local time before transport", () => {
  const clientSource = read("app/lib/supabase.ts");
  assert.equal((clientSource.match(/const transportInput = prepareCareEntryInputForTransport\(input\)/g) || []).length, 3);
  assert.match(clientSource, /createCareEntry[\s\S]*JSON\.stringify\(\{ input: transportInput \}\)/);
  assert.match(clientSource, /createCareEntryUnlessDuplicate[\s\S]*JSON\.stringify\(\{ dedupe: true, input: transportInput \}\)/);
  assert.match(clientSource, /updateCareEntry[\s\S]*JSON\.stringify\(\{ input: transportInput \}\)/);
});

test("Today introduces no fixed timezone offset and remains horizontally bounded", () => {
  const timeSources = `${read("app/lib/care-log.mjs")}\n${read("app/lib/today.ts")}\n${page}`;
  assert.doesNotMatch(timeSources, /UTC[+-]\d|(?:PST|PDT)|setHours\(|setUTCHours\(|[+-]\s*7\s*\*\s*60/);
  assert.match(css, /\.page \{[\s\S]*width: 100%/);
  assert.match(css, /\.recentNote \{[\s\S]*overflow-wrap: anywhere/);
  assert.match(read("app/globals.css"), /body \{[\s\S]*overflow-x: hidden/);
});
