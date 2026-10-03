import test from "node:test";
import assert from "node:assert/strict";
import { bindTypedReadTicket } from "../app/lib/furvise-brain/typed-read-ticket.ts";
import { retrieveReadTicket } from "../app/lib/furvise-brain/lungs.ts";
import { selectionPublication } from "../app/lib/intelligence/selection-publication.ts";
import { labsTaskComplete, buildLabsList } from "../app/lib/intelligence/labs-list.ts";
import { calculationEffectiveStore } from "./helpers/calculation-effective-store.mjs";

const pets = [{ id: "subject-one", name: "Ash", user_id: "owner" }, { id: "subject-two", name: "Elm", user_id: "owner" }];
const from = "2025-02-01T00:00:00Z", to = "2025-03-01T00:00:00Z";
async function fixture() {
  const bindings = pets.map((pet, i) => ({ id: "need:" + i, petIds: [pet.id], sourceSpanId: "turn:" + i + ":" + (i + 1) }));
  const needs = bindings.map(n => ({ needId: n.id, from, to, target: "2025-02", termGroups: [["meal"]], ordering: "asc",
    predicates: [{ kind: "text_any", terms: ["meal"] }],
    selection: { groupBy: ["subject"], union: [{ orderBy: [{ field: "event_at", direction: "asc" }], take: { count: 1, per: "group" } }] } }));
  const ticket = bindTypedReadTicket({ authority: "effective_fact", operation: "read", temporal: { from: null, to: null, anchor: null },
    predicates: [], selection: null, needs, outputs: { completeness: "sufficient", ordering: "asc", limit: null } }, pets.map(p => p.id), bindings);
  const rows = pets.map((pet, i) => ({ id: "record-" + i, user_id: "owner", pet_profile_id: pet.id, category: "general", title: null,
    note: "meal " + (40 + i) + " g", deleted_at: null, occurred_at: "2025-02-05T09:00:00Z",
    created_at: "2026-01-08T10:00:00Z", updated_at: "2026-01-08T10:00:00Z" }));
  const store = calculationEffectiveStore(rows, {}, pets);
  const result = await retrieveReadTicket(ticket, { userId: "owner", ownedPetIds: pets.map(p => p.id), from, to, asOf: "2026-10-03T12:00:00Z" }, store.store);
  return { ticket, result };
}
const transport = f => f.result.records.map(r => ({ id: r.id, petId: r.pet_profile_id }));
test("closed matching effective streams certify exhausted independent endpoints", async () => {
  const f = await fixture();
  assert.equal(f.result.coverage.status, "complete");
  const p = selectionPublication(f.ticket, f.result.coverage, transport(f));
  assert.equal(p.complete, true);
  assert.ok(p.certificates.every(c => c.certified && c.lineageClosed));
});
for (const [name, mutate] of [
  ["absent entire proof", c => { delete c.effectiveStream; }],
  ["null entire proof", c => { c.effectiveStream = null; }],
  ["empty proof array", c => { c.effectiveStream = []; }],
  ["duplicate subject proof", c => { c.effectiveStream.push(structuredClone(c.effectiveStream[0])); }],
  ["null proof entry", c => { c.effectiveStream = [null]; }],
  ["wrong subject proof", c => { c.effectiveStream[0].petId = "subject-two"; }],
  ["foreign extra proof", c => { c.effectiveStream.push({ ...structuredClone(c.effectiveStream[0]), petId: "foreign" }); }],
  ["entire proof from another need", (c, all) => { c.effectiveStream = structuredClone(all[1].coverage.effectiveStream); }],
  ["false lineage flag", c => { c.effectiveStream[0].lineageClosed = false; }],
  ["missing lineage flag", c => { delete c.effectiveStream[0].lineageClosed; }],
  ["truthy nonboolean lineage flag", c => { c.effectiveStream[0].lineageClosed = "true"; }],
  ["unclosed replacement seeds", c => { c.effectiveStream[0].replacementSeedsExhausted = false; }],
  ["missing replacement seeds", c => { delete c.effectiveStream[0].replacementSeedsExhausted; }],
  ["truthy nonboolean replacement seeds", c => { c.effectiveStream[0].replacementSeedsExhausted = "true"; }],
  ["stored-report proof on effective selection", c => { c.effectiveStream[0].storedReportsCertified = true; }],
  ["false stored-report flag", c => { c.effectiveStream[0].storedReportsCertified = false; }],
  ["selected ID outside certified membership", c => { c.effectiveStream[0].certifiedSelectedIds = ["unrelated"]; }],
  ["selected ID outside effective membership", c => { c.effectiveStream[0].effectiveIds = ["unrelated"]; }],
  ["missing effective membership", c => { delete c.effectiveStream[0].effectiveIds; }],
  ["null certified membership", c => { c.effectiveStream[0].certifiedSelectedIds = null; }],
  ["missing acquisition membership", c => { delete c.effectiveStream[0].acquiredIds; }],
  ["duplicate effective identity", c => { c.effectiveStream[0].effectiveIds.push(c.effectiveStream[0].effectiveIds[0]); }],
  ["missing graph count", c => { delete c.effectiveStream[0].graphCalls; }],
]) {
  test(name + " cannot certify an independent selection", async () => {
    const f = await fixture(), coverage = structuredClone(f.result.coverage);
    const child = coverage.independentSelections[0];
    const needId = child.needId;
    mutate(child.coverage, coverage.independentSelections);
    const p = selectionPublication(f.ticket, coverage, transport(f));
    assert.equal(p.complete, false);
    assert.ok(p.certificates.filter(c => c.needId === needId).every(c => !c.certified));
    const evidence = { scope: { status: "resolved", readOnlyRecall: true, authorizedPetIds: pets.map(p => p.id) },
      interpretation: { request: { mode: "read", quantity: "records", readTicket: f.ticket,
        evidenceNeeds: f.ticket.needs.map(n => ({ id: n.id, petIds: n.petIds, window: { from: n.from, to: n.to }, order: "earliest" })), requirements: [] } },
      history: { ticketCoverage: coverage, provenance: [], eventCandidateIds: [], candidateIds: f.result.records.map(r => "care:" + r.id) }, petNames: Object.fromEntries(pets.map(p => [p.id, p.name])) };
    const labs = buildLabsList(evidence, f.result.records);
    assert.ok(!labs || !labsTaskComplete(labs));
  });
}
