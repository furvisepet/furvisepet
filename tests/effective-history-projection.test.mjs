import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { projectEffectiveCareHistory } from "../app/lib/effective-history.ts";

const entry = (id, source, overrides = {}) => ({
  id, user_id: "owner", pet_profile_id: "milo", category: "food", title: "Food preference",
  note: id, severity: null, occurred_at: "2026-08-13T00:00:00Z", created_at: "2026-08-13T00:00:00Z",
  updated_at: "2026-08-13T00:00:00Z", intelligence_source_message_id: source, ...overrides,
});
const memory = (id, source, status, factKey, factValue, overrides = {}) => ({
  id, source_id: source, status, subject_type: "pet", pet_id: "milo", category: "preference",
  fact_key: factKey, fact_value: factValue, ...overrides,
});

test("preference correction hides the obsolete current-looking History item and keeps its correction", () => {
  const original = entry("Milo likes beef treats.", "old-source");
  const correction = entry("Milo doesn't like beef anymore and prefers turkey.", "new-source");
  const rows = [original, correction];
  const provenance = [
    memory("old", "old-source", "superseded", "treat_preference", "Milo likes beef treats."),
    memory("negative", "new-source", "active", "foodavoid", "beef"),
    memory("positive", "new-source", "active", "food_preference_turkey", { preference: "prefer", value: "turkey" }),
  ];

  assert.deepEqual(projectEffectiveCareHistory(rows, provenance).map((item) => item.note), [correction.note]);
  assert.equal(rows.length, 2, "source History rows remain available as provenance");
  assert.equal(provenance.find((item) => item.id === "old")?.status, "superseded");
});

test("medical event and recovery remain visible even when current state is resolved", () => {
  const symptom = entry("Milo vomited twice this morning.", "symptom-source", { category: "symptom", state_action_type: "create_entry" });
  const recovery = entry("Milo returned to normal.", "recovery-source", { category: "symptom", state_action_type: "resolve_concern" });
  const linked = [memory("symptom-state", "symptom-source", "resolved", "symptom_state", "vomiting", { category: "symptom" })];
  assert.deepEqual(projectEffectiveCareHistory([symptom, recovery], linked).map((item) => item.note), [symptom.note, recovery.note]);
});

test("Ask corrections supersede and relation-link provenance instead of invoking Forget", async () => {
  const source = await readFile(new URL("../app/lib/intelligence/persist-learnings.ts", import.meta.url), "utf8");
  const correctionBlock = source.slice(source.indexOf("async function suppressExplicitlyReplacedPreferences"));
  assert.match(correctionBlock, /status: "superseded", superseded_by: successor\.id/);
  assert.doesNotMatch(correctionBlock, /p_action:\s*"forget"/);
});
