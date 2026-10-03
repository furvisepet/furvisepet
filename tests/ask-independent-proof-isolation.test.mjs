import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bindTypedReadTicket } from "../app/lib/furvise-brain/typed-read-ticket.ts";
import { retrieveReadTicket } from "../app/lib/furvise-brain/lungs.ts";
import { selectionPublication } from "../app/lib/intelligence/selection-publication.ts";
import { labsTaskComplete } from "../app/lib/intelligence/labs-list.ts";
import { generateContextAwareAskResponse } from "../app/lib/ai/ask-reasoning.ts";
import { validateGeneratedAnswer } from "../app/lib/intelligence/validation/validate-answer.ts";
import { reviewHistoricalAnswer } from "../app/lib/intelligence/review-history-narrative.ts";
import { calculationEffectiveStore } from "./helpers/calculation-effective-store.mjs";

const pets = [{ id: "isolation-a", name: "Alder", user_id: "owner" }, { id: "isolation-b", name: "Birch", user_id: "owner" }];
const from = "2025-04-01T00:00:00Z", to = "2025-05-01T00:00:00Z", asOf = "2026-10-03T12:00:00Z";
const question = "Show Alder's earliest meal in April 2025 and Birch's latest mass in April 2025.";
async function fixture(partial = [], reverse = false) {
  const bindings = pets.map((p, i) => ({ id: "obligation:" + i, petIds: [p.id], sourceSpanId: "turn:" + i + ":" + (i + 1) }));
  const needs = bindings.map((b, i) => ({ needId: b.id, from, to, target: "2025-04", termGroups: [[i ? "mass" : "meal"]],
    ordering: i ? "desc" : "asc", predicates: [{ kind: "text_any", terms: [i ? "mass" : "meal"] }],
    selection: { groupBy: ["subject"], union: [{ orderBy: [{ field: "event_at", direction: i ? "desc" : "asc" }], take: { count: 1, per: "group" } }] } }));
  if (reverse) needs.reverse();
  const ticket = bindTypedReadTicket({ authority: "effective_fact", operation: "read", temporal: { from: null, to: null, anchor: null },
    predicates: [], selection: null, needs, outputs: { completeness: "sufficient", ordering: "asc", limit: null } }, pets.map(p => p.id), bindings);
  const rows = pets.map((p, i) => ({ id: "endpoint-" + i, user_id: "owner", pet_profile_id: p.id, category: "general", title: null,
    note: i ? "mass 6.875 kg" : "meal 53 g", deleted_at: null, occurred_at: "2025-04-09T09:00:00Z",
    created_at: "2026-02-08T10:00:00Z", updated_at: "2026-02-08T10:00:00Z" }));
  const store = calculationEffectiveStore(rows, { partialPets: partial }, pets);
  const result = await retrieveReadTicket(ticket, { userId: "owner", ownedPetIds: pets.map(p => p.id), from, to, asOf }, store.store);
  const interpretation = { operation: "recall", readOperation: "recall", petIds: pets.map(p => p.id), request: {
    mode: "read", referenceTurnIds: [], premiseQuotes: [], evidenceBasis: "saved_history", readTicket: ticket, quantity: "records", requirements: [], profileFields: [],
    evidenceNeeds: ticket.needs.map(n => ({ id: n.id, petIds: n.petIds, window: { from: n.from, to: n.to }, order: n.ordering === "asc" ? "earliest" : "latest" })) } };
  return { ticket, result, interpretation, calls: store.calls };
}
async function publish(f, name) {
  const evidence = { version: "ask-evidence.v1", petNames: Object.fromEntries(pets.map(p => [p.id, p.name])),
    scope: { authorizedPetIds: pets.map(p => p.id), status: "resolved", readOnlyRecall: true, requestKind: "record_lookup", requestText: question },
    interpretation: f.interpretation, history: { ticketCoverage: f.result.coverage, provenance: [],
      candidateIds: f.result.records.map(r => "care:" + r.id), eventCandidateIds: [], reasons: [], needs: [] },
    sources: [], represented: [], losses: [], verifiedFacts: [], representation: "complete",
    completeness: { retrieval: "unknown", corrections: "unknown", extraction: "unknown", grouping: "unknown" } };
  let forbiddenCalls = 0;
  const client = { responses: { create: async () => { forbiddenCalls++; throw Error("UNEXPECTED_PROVIDER"); } } };
  const response = await generateContextAwareAskResponse({ question, evidenceContract: evidence, profiles: pets,
    careEntries: f.result.records, memories: [], productFeedback: [], conversationTurns: [], recentUpdates: [], client });
  assert.equal(forbiddenCalls, 0);
  assert.equal(await reviewHistoricalAnswer({ result: response, client }), true);
  const validation = validateGeneratedAnswer(response, { feature: "ask", owner: { userId: "owner" }, pet: pets[0], eligiblePets: pets,
    currentMessage: question, currentTurn: { id: "isolation-turn", role: "user", text: question, createdAt: asOf }, currentTimestamp: asOf,
    conversationTurns: [], timeZone: "UTC", careEntries: f.result.records, memories: [], activeConcerns: [], recentlyResolvedConcerns: [],
    askInterpretation: f.interpretation }, "routine", pets.map(p => p.id));
  const publication = selectionPublication(f.ticket, f.result.coverage, f.result.records.map(r => ({ id: r.id, petId: r.pet_profile_id })));
  if (process.env.FURVISE_ISOLATION_TRACE_DIR) fs.writeFileSync(process.env.FURVISE_ISOLATION_TRACE_DIR + "/" + name + ".json",
    JSON.stringify({ requestedObligations: f.interpretation.request.evidenceNeeds, typedPlan: f.ticket, organ: f.result,
      organCalls: f.calls, certificates: publication, labs: response.labsList, publication: response, completion: validation,
      providerCalls: forbiddenCalls }, null, 2), { flag: "wx" });
  return { response, validation, publication };
}
for (const reverse of [false, true]) test("authentic unclosed need preserves certified companion" + (reverse ? " when reordered" : ""), async () => {
  const f = await fixture([pets[0].id], reverse);
  const before = structuredClone(f.result);
  const failed = f.result.coverage.independentSelections.find(p => p.needId === "obligation:0");
  assert.equal(failed.coverage.effectiveStream[0].lineageClosed, false);
  assert.equal(failed.coverage.effectiveStream[0].replacementSeedsExhausted, false);
  assert.deepEqual(f.result.records.map(r => r.id), ["endpoint-1"]);
  const { response, validation, publication } = await publish(f, reverse ? "partial-reordered" : "partial");
  assert.equal(publication.transportValid, true, "well-shaped incomplete proof is not malformed transport");
  assert.equal(publication.complete, false);
  assert.equal(publication.certificates.find(c => c.needId === "obligation:0").certified, false);
  assert.equal(publication.certificates.find(c => c.needId === "obligation:1").certified, true);
  assert.ok(response.labsList, "certified companion must reach Labs publication");
  assert.deepEqual(response.labsList.records.map(r => r.id), ["endpoint-1"]);
  assert.equal(labsTaskComplete(response.labsList), false);
  assert.match(response.answer.summary, /couldn.t verify.*Alder/);
  assert.match(response.answer.summary, /corrections or deletions/);
  assert.match(response.answer.summary, /2025-04-09.*saved at 2026-02-08/);
  assert.match(JSON.stringify(response.answer), /6\.875/);
  assert.doesNotMatch(JSON.stringify(response.answer), /53 g/);
  assert.equal(validation.valid, true);
  assert.equal(validation.assessment.outcome, "limited");
  assert.deepEqual(f.result, before, "publication must preserve source and correction lineage");
});
test("two authentic incomplete needs remain transport valid without certifying facts", async () => {
  const f = await fixture(pets.map(p => p.id));
  const { response, validation, publication } = await publish(f, "both-incomplete");
  assert.equal(publication.transportValid, true);
  assert.equal(publication.complete, false);
  assert.ok(publication.certificates.every(c => !c.certified));
  assert.deepEqual(publication.selectedEventIds, []);
  assert.ok(!response.labsList || !labsTaskComplete(response.labsList));
  assert.doesNotMatch(JSON.stringify(response.answer), /6\.875|53 g/);
  assert.equal(validation.assessment.outcome, "limited");
});
test("all closed independent obligations publish and complete", async () => {
  const f = await fixture();
  const { response, validation, publication } = await publish(f, "all-certified");
  assert.equal(publication.transportValid, true);
  assert.equal(publication.complete, true);
  assert.equal(labsTaskComplete(response.labsList), true);
  assert.equal(validation.assessment.outcome, "complete");
  assert.deepEqual(response.labsList.records.map(r => r.id).sort(), ["endpoint-0", "endpoint-1"]);
});
for (const [name, mutate] of [
  ["absent", c => { delete c.effectiveStream; }],
  ["null", c => { c.effectiveStream = null; }],
  ["empty", c => { c.effectiveStream = []; }],
  ["duplicate", c => { c.effectiveStream.push(structuredClone(c.effectiveStream[0])); }],
  ["wrong-subject", c => { c.effectiveStream[0].petId = pets[1].id; }],
  ["missing-field", c => { delete c.effectiveStream[0].lineageClosed; }],
  ["malformed-flag", c => { c.effectiveStream[0].replacementSeedsExhausted = "false"; }],
  ["malformed-membership", c => { c.effectiveStream[0].acquiredIds = null; }],
]) test("malformed " + name + " proof rejects transport and publication", async () => {
  const f = await fixture([pets[0].id]);
  mutate(f.result.coverage.independentSelections.find(p => p.needId === "obligation:0").coverage);
  const { response, validation, publication } = await publish(f, "malformed-" + name);
  assert.equal(publication.transportValid, false);
  assert.equal(publication.complete, false);
  assert.equal(publication.certificates.find(c => c.needId === "obligation:0").certified, false);
  assert.ok(!response.labsList, "malformed authority cannot reach factual publication");
  assert.doesNotMatch(JSON.stringify(response.answer), /6\.875|53 g/);
  assert.equal(validation.assessment.outcome, "limited");
});
