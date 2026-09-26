import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const { parseAskResponse, containsFurviseImplementationTrace } = await import("../app/lib/ask.mjs");

const base = { title: "Furvise", summary: "Aster is stable.", sections: [], safetyNote: null };

test("Furvise-authored prose contains no em dashes", () => {
  const parsed = parseAskResponse({ ...base, summary: "Aster is stable — keep watching appetite." });
  assert.ok(parsed);
  assert.doesNotMatch(parsed.summary, /—/);
  assert.match(parsed.summary, /stable, keep watching/);
});

test("literal quoted owner wording is preserved while surrounding Furvise prose is normalized", () => {
  const parsed = parseAskResponse({ ...base, summary: 'Saved wording — "owner wrote — exactly this".' });
  assert.ok(parsed);
  assert.doesNotMatch(parsed.summary.replace('"owner wrote — exactly this"', ""), /—/);
  assert.match(parsed.summary, /"owner wrote — exactly this"/);
});

test("implementation traces cannot cross the Mouth boundary", () => {
  for (const text of [
    "The AI could not answer that.",
    "The provider call failed.",
    "The model response was incomplete.",
    "The token budget was exceeded.",
    "The semantic contract was rejected.",
    "The system prompt says otherwise.",
  ]) {
    assert.equal(containsFurviseImplementationTrace(text), true, text);
    assert.equal(parseAskResponse({ ...base, summary: text }), null, text);
  }
});

test("quoted owner text does not become an implementation leak", () => {
  const quoted = parseAskResponse({ ...base, summary: 'You wrote "AI can be useful".' });
  assert.ok(quoted);
  assert.match(quoted.summary, /"AI can be useful"/);
});

test("Ask footer names Furvise, not AI", () => {
  const notice = readFileSync(new URL("../app/components/beta-feedback-notice.tsx", import.meta.url), "utf8");
  assert.match(notice, /Furvise can make mistakes/);
  assert.doesNotMatch(notice, /AI can make mistakes/);
});
