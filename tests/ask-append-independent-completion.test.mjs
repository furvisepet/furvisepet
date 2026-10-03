import test from "node:test";
import assert from "node:assert/strict";
import { engineFixture, id, proposal } from "./helpers/ask-route-ordering.mjs";
import { labsTaskComplete, serializeLabsList } from "../app/lib/intelligence/labs-list.ts";
import { selectionPublication } from "../app/lib/intelligence/selection-publication.ts";

const message = "Log that Cedar rested quietly. Show Cedar's earliest meal and earliest mass in August 2026.";
function request() {
  const p = proposal(message);
  p.selection = "summary";
  p.topic = "history";
  p.appendJob = { operation: "append", petName: "Cedar", bodyQuote: "Cedar rested quietly.",
    companionQuote: "Show Cedar's earliest meal and earliest mass in August 2026." };
  p.readTicket = { authority: "effective_fact", operation: "read", subjectScope: "selected",
    temporal: { from: null, to: null, anchor: null }, predicates: [], selection: null,
    probes: ["meal", "mass"].map(topic => ({ quote: "earliest " + topic, sourceTurnId: null, petNames: ["Cedar"],
      from: "2026-08-01T00:00:00Z", to: "2026-09-01T00:00:00Z", target: "2026-08",
      termGroups: [[topic]], ordering: "asc", predicates: [{ kind: "text_any", terms: [topic] }],
      selection: { groupBy: ["subject"], union: [{ orderBy: [{ field: "event_at", direction: "asc" }], take: { count: 1, per: "group" } }] } })),
    outputs: { completeness: "sufficient", ordering: "asc", limit: null } };
  return p;
}
const row = (n, note) => ({ id: id(100 + n), user_id: id(1), pet_profile_id: id(11), category: "general",
  title: null, note, deleted_at: null, occurred_at: new Date(Date.parse("2026-08-02T09:00:00Z") + n * 60000).toISOString(),
  created_at: "2026-09-01T11:00:00Z", updated_at: "2026-09-01T11:00:00Z" });

async function confirmed(rows) {
  const f = engineFixture({ proposal: request() });
  f.rows.pet_care_entries.splice(0, Infinity, ...rows);
  const sent = await f.send(message);
  assert.equal(sent.status, 200, JSON.stringify(f.state.errors));
  assert.equal(f.state.planner, 1);
  assert.ok(!f.state.events.includes("read:pet_care_entries"), "No factual read before confirmation");
  assert.equal(f.rows.pet_care_entries.length, rows.length);
  const action = await f.confirm();
  assert.equal(action.status, 200, JSON.stringify(f.state.errors));
  const payload = await action.json();
  assert.equal(payload.action.status, "succeeded");
  const stored = f.rows.ask_conversation_messages.find(r => r.id === id(61)).response_data;
  assert.ok(stored.appendLabs);
  assert.ok(f.state.events.indexOf("heart:receipt") < f.state.events.indexOf("read:pet_care_entries"));
  assert.equal(stored.turn.mutationOutcome, "applied");
  assert.equal(f.state.planner, 1, "Confirmation must not open another provider phase");
  return { f, stored };
}
test("confirmed append preserves limited whole-task outcome for an exhausted independent lexical miss", async () => {
  const { f, stored } = await confirmed([row(0, "meal 42 g")]);
  const labs = stored.appendLabs;
  assert.equal(labs.coverage.status, "complete");
  assert.equal(labsTaskComplete(labs), false);
  const publication = selectionPublication(labs.ticket, labs.coverage, labs.records);
  assert.equal(publication.certificates.filter(c => c.certified).length, 1);
  assert.match(serializeLabsList(labs), /42 g/);
  assert.match(serializeLabsList(labs), /could not|cannot|couldn't|not certified|unable|couldn’t/i);
  assert.match(serializeLabsList(labs), /2026-08-02/);
  assert.match(serializeLabsList(labs), /saved at 2026-09-01T11:00:00Z/);
  assert.equal(stored.turn.answerOutcome, "limited");
  assert.equal(stored.turn.taskOutcome, "limited");
  const before = f.rows.pet_care_entries.length;
  const replay = await (await f.confirm()).json();
  assert.equal(replay.action.status, "succeeded");
  assert.equal(f.rows.pet_care_entries.length, before, "Receipt replay cannot duplicate the append");
  const replayed = f.rows.ask_conversation_messages.find(r => r.id === id(61)).response_data;
  assert.equal(replayed.turn.answerOutcome, "limited");
  assert.equal(replayed.turn.mutationOutcome, "applied");
  assert.equal(replayed.turn.taskOutcome, "limited");
  assert.equal(f.state.planner, 1);
});
test("confirmed append completes certified independent endpoints despite partial scan coverage", async () => {
  const rows = [row(0, "meal 42 g"), row(1, "mass 7.25 kg"),
    ...Array.from({ length: 100 }, (_, i) => row(i + 2, "ordinary activity"))];
  const { f, stored } = await confirmed(rows);
  const labs = stored.appendLabs;
  assert.equal(labs.coverage.status, "partial");
  assert.equal(labsTaskComplete(labs), true);
  assert.equal(selectionPublication(labs.ticket, labs.coverage, labs.records).complete, true);
  assert.match(serializeLabsList(labs), /42 g/);
  assert.match(serializeLabsList(labs), /7.25 kg/);
  assert.equal(stored.turn.answerOutcome, "complete");
  assert.equal(stored.turn.taskOutcome, "complete");
  const before = f.rows.pet_care_entries.length;
  await f.confirm();
  assert.equal(f.rows.pet_care_entries.length, before);
  assert.equal(f.state.planner, 1);
});
