import { admitAiOperation } from "../app/lib/ai/usage-guard/admission.ts";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ownedPlanningFixture } from "./helpers/owned-planning-context.mjs";
import { fixtureSemanticsPage } from "../scripts/audits/helpers/source-semantics-fixture.mjs";
import { interpretAskQuestion, prepareAskInterpretationRequest } from "../app/lib/intelligence/interpret-ask.ts";
import { retrieveReadTicket } from "../app/lib/furvise-brain/lungs.ts";
import { createEffectiveWindowResolver } from "../app/lib/intelligence/history-retrieval.ts";
import { generateContextAwareAskResponse } from "../app/lib/ai/ask-reasoning.ts";
import { reviewHistoricalAnswer } from "../app/lib/intelligence/review-history-narrative.ts";
import { validateGeneratedAnswer } from "../app/lib/intelligence/validation/validate-answer.ts";

globalThis.fetch = async () => { throw Error("OFFLINE_CONTROLLED_REFERENCES_ONLY"); };
const id = n => "11111111-1111-4111-8111-" + String(n).padStart(12, "0");
const pets = ["Juniper", "Tamarack"].map((name, i) =>
  ({ id: id(10 + i), user_id: "owner", name, species: i ? "cat" : "dog" }));
const sourceId = "care:" + id(20), otherSourceId = "care:" + id(21);
const sha = x => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

function context(question = "What did that saved entry say?", priorCount = 8) {
  const turns = priorCount ? [
    { id: "subject-user", role: "user", text: "Juniper is the subject I mean." },
    { id: "cited-user", role: "user", text: "Show the saved entry." },
    { id: "cited-assistant", role: "furvise", text: "[" + sourceId + "]" },
    ...Array.from({ length: Math.max(0, priorCount - 2) }, (_, i) =>
      ({ id: "filler-" + i, role: "user", text: "Keep the earlier conversation unchanged." })),
  ] : [];
  return { owner: { userId: "owner" }, eligiblePets: pets, pet: pets[0], conversationId: "owned-conversation",
    currentMessage: question, currentTurn: { id: "current-user", role: "user", text: question },
    conversationTurns: turns, timeZone: "UTC" };
}
function proposal(c, { predicates, refs, scope, names, authority = "stored_report" } = {}) {
  const prior = c.conversationTurns.length > 0;
  const subjectScope = scope || (prior ? "conversation" : "named");
  return { calculatePlan: null, storedRead: null, removeJob: null, stateTransitionJob: null,
    fieldMutationJob: null, lifecyclePlan: null, appendJob: null, writeJob: null, task: null,
    temporalScope: "historical", mutationIntent: null, recordSelection: null, profileFields: [],
    projection: null, evidenceNeeds: [], version: "ask-request.v2", mode: "read",
    question: c.currentMessage, requirements: [], referenceTurnIds: refs || (prior ? ["subject-user", "cited-user"] : []),
    evidenceBasis: "saved_history", outputFormat: "prose", premiseQuotes: [], excludedPetNames: [],
    scope: subjectScope, petNames: names || ["Juniper"], operation: "recall", selection: "summary",
    quantity: "records", topic: "history", terms: [], from: null, to: null, episodeTopic: null, ordinal: null, frame: null,
    readTicket: { authority, subjectScope, operation: "read", temporal: { from: null, to: null, anchor: null, calendar: null },
      predicates: predicates || (prior ? [{ kind: "source_ref", sources: [{ sourceTurnId: "cited-user", sourceId }] }] : [{ kind: "text_any", terms: ["routine"] }]),
      probes: [], searchHints: null, episode: null, outputs: { completeness: "sufficient", ordering: "desc", limit: null },
      selection: { groupBy: ["subject"], union: [{ orderBy: [{ field: "event_at", direction: "desc" }], take: { count: 1, per: "group" } }] } } };
}
async function wireInterpret(c, p, { alterRows, mutateWire } = {}) {
  const loaded = await ownedPlanningFixture(c, alterRows);
  const started = performance.now();
  const prepared = prepareAskInterpretationRequest(loaded.context, "gpt-5.4-mini");
  const prepareSeconds = (performance.now() - started) / 1000;
  const canonical = { request: p };
  const wire = prepared.transport.encode(canonical, () => {});
  assert.equal(typeof wire.request.kind, "string");
  assert.deepEqual(prepared.transport.decode(JSON.parse(JSON.stringify(wire)), () => {}), canonical);
  if (mutateWire) mutateWire(wire);
  let calls = 0;
  // Disable only Node's legacy direct-canonical fixture compatibility, so the
  // real production wire parser/decoder and original Binder execute.
  const old = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  let admission;
  try {
    admission = await admitAiOperation({
      env: { NODE_ENV: "test", FURVISE_AI_DAILY_CALL_LIMIT: "20", FURVISE_AI_DAILY_COST_LIMIT_USD: "10",
        FURVISE_RATE_LIMIT_HASH_SECRET: "controlled-reference-test-only-not-live" },
      store: new MemoryAiGuardTestStore(), feature: "ask", intendedModel: "gpt-5.4-mini",
      userId: "owner", requestId: crypto.randomUUID(), payload: { fixture: "normal-user-reference" },
      now: new Date("2039-01-01T00:00:00Z"),
    });
    const result = await admission.run(() => interpretAskQuestion({ context: loaded.context, model: "gpt-5.4-mini",
      client: { responses: { create: async request => {
        calls++;
        assert.deepEqual(request, prepared.request, "same actual normal builder request");
        const input = JSON.parse(request.input);
        assert.equal(input.currentSourceId, c.currentTurn.id);
        assert.ok(JSON.stringify(request).length <= 135000);
        for (const pin of loaded.context.pinnedUserSourceIds) assert.ok(input.userSources.some(s => s.id === pin));
        if (process.env.GN_MEASUREMENTS) appendFileSync(process.env.GN_MEASUREMENTS, JSON.stringify({
          chars: JSON.stringify(request).length, headroom: 135000 - JSON.stringify(request).length,
          inputEstimate: Math.ceil(JSON.stringify(request).length / 3), prepareSeconds,
          window: input.sourceWindow, userSourceHashes: input.userSources.map(s => ({ id: s.id, chars: s.text.length, sha256: sha(s.text) })),
          requestSHA256: sha(request), realProviderCalls: 0 }) + "\n");
        return { status: "completed", output_text: JSON.stringify(wire), usage: { input_tokens: 1, output_tokens: 1 } };
      } } } }));
    assert.equal(calls, 1);
    return { result, loaded, prepared, calls };
  } finally {
    if (admission) await admission.release();
    if (old === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = old;
  }
}
const row = (n, petId = pets[0].id) => ({ id: id(n), user_id: "owner", pet_profile_id: petId,
  category: "general", title: "A display label", note: "Routine recorded observation.",
  occurred_at: "2026-01-02T00:00:00Z", created_at: "2026-01-02T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z", deleted_at: null, severity: null });
async function publish(run, { pageRows = [row(20)], freshRows = pageRows, unscopedPage = false } = {}) {
  const ticket = run.result.request.readTicket, petIds = run.result.petIds, calls = [];
  const scope = { userId: "owner", ownedPetIds: petIds, from: "2020-01-01T00:00:00Z",
    to: "2027-01-01T00:00:00Z", asOf: "2026-09-20T00:00:00Z" };
  const coverage = { queryCount: 0 };
  const db = { rpc(name, args) {
    calls.push({ name, args });
    if (name === "read_ask_source_semantics") return { abortSignal: async () => fixtureSemanticsPage(freshRows, args, {}) };
    assert.equal(name, "read_ask_history_correction_page");
    // Empty correction graph is genuine controlled data, not a certificate.
    // The production resolver verifies exact fresh source snapshots and closes it.
    const sources = freshRows.filter(r => args.p_care_ids.includes(r.id));
    return { abortSignal: async () => ({ error: null, data: { claims: [], relations: [], lineage: [],
      sources, withheld_claim_ids: [], withheld_source_ids: args.p_care_ids.filter(id => !sources.some(r => r.id === id)),
      truncated: false } }) };
  }};
  const resolve = createEffectiveWindowResolver({ authority: ticket.authority, owned: new Set(petIds),
    petIds, userId: "owner", db, coverage, deadline: Date.now() + 60000 });
  const read = await retrieveReadTicket(ticket, scope, { effectiveWindow: resolve,
    effective: async () => { throw Error("production source resolver required"); },
    page: async q => pageRows.filter(r => unscopedPage || r.pet_profile_id === q.petId && r.occurred_at >= q.from && r.occurred_at < q.to)
      .sort((a, b) => (q.ordering === "desc" ? -1 : 1) * a.id.localeCompare(b.id)).slice(q.offset, q.offset + q.limit) });
  const evidence = { version: "ask-evidence.v1", petNames: Object.fromEntries(pets.map(p => [p.id, p.name])),
    scope: { authorizedPetIds: petIds, requestText: run.loaded.context.currentMessage, status: "resolved", readOnlyRecall: true, requestKind: "record_lookup" },
    interpretation: run.result, history: { ticketCoverage: read.coverage, provenance: [], candidateIds: read.records.map(r => "care:" + r.id),
      eventCandidateIds: read.records.map(r => "care:" + r.id), reasons: read.coverage.reasons, needs: [] },
    sources: [], represented: [], losses: [], verifiedFacts: [], representation: "complete",
    completeness: { retrieval: read.coverage.status, corrections: "unknown", extraction: "unknown", grouping: "unknown" } };
  let extraProviderCalls = 0;
  const noProvider = { responses: { create: async () => { extraProviderCalls++; throw Error("no publication provider"); } } };
  const result = await generateContextAwareAskResponse({ evidenceContract: evidence, profiles: pets, careEntries: read.records,
    memories: [], productFeedback: [], conversationTurns: [], recentUpdates: [], question: run.loaded.context.currentMessage,
    requestId: "controlled-read-publication", locale: "en", client: noProvider });
  const checkedContext = { ...run.loaded.context, careEntries: read.records,
    askHistory: { entries: read.records, coverage: { ticketCoverage: read.coverage } }, askInterpretation: run.result };
  const reviewed = await reviewHistoricalAnswer({ result, client: noProvider });
  const validation = validateGeneratedAnswer(result, checkedContext, "routine", petIds);
  assert.equal(extraProviderCalls, 0);
  return { read, result, reviewed, validation, calls };
}

for (const count of [2, 7, 8, 9, 39]) test("normal loader and full wire retain USER subject plus cited source at history " + count, async () => {
  const c = context("Could you repeat what that entry recorded?", count), run = await wireInterpret(c, proposal(c));
  assert.ok(run.loaded.context.pinnedUserSourceIds.includes("subject-user"));
  assert.ok(run.loaded.context.pinnedUserSourceIds.includes("cited-user"));
  assert.ok(run.prepared.context.planningSourceWindow.retainedPriorUserTurnIds.length <= 8);
  assert.deepEqual(run.result.petIds, [pets[0].id]);
  assert.deepEqual(run.result.request.referenceTurnIds, ["subject-user", "cited-user"]);
  const published = await publish(run);
  assert.equal(published.result.model, "server-labs-list");
  assert.equal(published.validation.valid, true);
  assert.equal(published.validation.assessment.outcome, "complete");
  assert.equal(published.reviewed, true);
  assert.equal(published.result.labsList.ticket.authority, "stored_report");
  assert.deepEqual(published.result.relevantContextIds, [sourceId]);
});
test("named and household full-wire scopes preserve requested owned subjects", async () => {
  for (const [question, scope, names, refs] of [
    ["Show routine records for Juniper.", "named", ["Juniper"], []],
    ["Show the latest routine records for every pet.", "account", [], []],
  ]) {
    const c = context(question, 0), p = proposal(c, { scope, names, refs });
    const run = await wireInterpret(c, p);
    assert.deepEqual(run.result.petIds.sort(), scope === "account" ? pets.map(p => p.id).sort() : [pets[0].id]);
  }
});
test("source identity AND intentional literal conditions are preserved including empty selection", async () => {
  for (const term of ["routine", "unmatched-literal"]) {
    const c = context("Show that entry only if it contains the literal text " + term + "."), p = proposal(c);
    p.readTicket.predicates.push({ kind: "text_any", terms: [term] });
    const run = await wireInterpret(c, p), published = await publish(run);
    assert.equal(run.result.request.readTicket.predicates.length, 2);
    assert.deepEqual(published.read.records.map(r => r.id), term === "routine" ? [id(20)] : []);
    if (term !== "routine") { assert.deepEqual(published.result.relevantContextIds, []); assert.ok(!published.result.answer.summary.includes(row(20).note)); }
  }
});
test("fresh source hash drift, tombstone and foreign owner cannot publish acquired wording", async () => {
  const c = context(), run = await wireInterpret(c, proposal(c));
  for (const fresh of [{ ...row(20), note: "Changed after acquisition." }, { ...row(20), deleted_at: "2026-02-01T00:00:00Z" },
    { ...row(20), user_id: "foreign" }]) {
    const published = await publish(run, { freshRows: [fresh] });
    assert.deepEqual(published.read.records, []);
    assert.notEqual(published.validation.assessment.outcome, "complete");
  }
});
test("source from another subject cannot be substituted under a correct citation", async () => {
  const c = context(), run = await wireInterpret(c, proposal(c));
  const published = await publish(run, { pageRows: [{ ...row(20), pet_profile_id: pets[1].id }], unscopedPage: true });
  assert.ok(published.read.coverage.reasons.includes("invalid_directional_page"));
  assert.deepEqual(published.read.records, []);
  assert.notEqual(published.validation.assessment.outcome, "complete");
});
test("a cited pair requires its declared USER turn in original Binder", async () => {
  const c = context(), p = proposal(c, { refs: ["subject-user"] });
  await assert.rejects(wireInterpret(c, p), e => e.diagnostics?.providerErrorCode === "ASK_REQUEST_CONTRACT_SOURCE_REFERENCE");
});
test("correlated producer schema rejects mismatched citation pairs before dispatch", async () => {
  const c = context();
  c.conversationTurns.splice(3, 0,
    { id: "other-cited-user", role: "user", text: "Show another saved entry." },
    { id: "other-cited-assistant", role: "furvise", text: "[" + otherSourceId + "]" });
  const p = proposal(c, { refs: ["subject-user", "cited-user", "other-cited-user"] });
  p.readTicket.predicates[0].sources[0].sourceId = otherSourceId;
  await assert.rejects(wireInterpret(c, p), /^Error: ASK_OPERATION_CANONICAL_SCHEMA$/);
});
test("foreign conversation and current USER text drift fail in the actual normal loader", async () => {
  for (const alter of [
    rows => { rows.ask_conversations[0].user_id = "foreign"; },
    rows => { rows.ask_conversation_messages.at(-1).user_text = "not this current USER"; },
  ]) await assert.rejects(ownedPlanningFixture(context(), alter), e => e.code === "CONTEXT_UNAVAILABLE");
});
test("assistant-only subject mention is not USER authority even with a genuine cited locator", async () => {
  const c = context();c.conversationTurns[0].text = "Show the saved subject.";
  c.conversationTurns[2].text = "Juniper [" + sourceId + "]";
  const loaded = await ownedPlanningFixture(c);
  assert.deepEqual(loaded.context.pinnedUserSourceIds, ["cited-user"]);
  const p = proposal(c, { refs: ["cited-user"] });
  await assert.rejects(wireInterpret(c, p), e => ["ASK_REQUEST_CONTRACT_CONVERSATION_SUBJECT", "ASK_REQUEST_CONTRACT_OMITTED_SUBJECT_REFERENCE"].includes(e.diagnostics?.providerErrorCode));
});
test("foreign assistant reply identity is excluded from normal cited pair availability", async () => {
  const f = await ownedPlanningFixture(context(), rows => {
    rows.ask_conversation_messages.find(r => r.role === "furvise").user_id = "foreign";
  });
  assert.ok(!f.context.conversationTurns.some(t => t.role === "furvise"));
  assert.deepEqual(f.context.pinnedUserSourceIds, ["subject-user"]);
});
test("original unpinned and omitted reference cases still reject at their original contract stages", async () => {
  const petsOld = ["Aster", "Bramble", "Echo"].map(name => ({ id: name.toLowerCase(), name, user_id: "owner", species: "dog" }));
  const old = { owner: { userId: "owner" }, eligiblePets: petsOld, pet: petsOld[0], timeZone: "UTC",
    conversationTurns: [{ id: "u0", role: "user", text: "Aster, Bramble and Echo are the pets I mean." }] };
  for (const [question, scope, refs, code] of [
    ["last weight for all 3", "conversation", ["u0"], "ASK_REQUEST_CONTRACT_REFERENCE"],
    ["latest weight for each during 2025", "named", [], "ASK_REQUEST_CONTRACT_OMITTED_SUBJECT_REFERENCE"],
  ]) {
    const c = { ...old, currentMessage: question, currentTurn: { id: "u1", role: "user", text: question } };
    const p = proposal(c, { scope, refs, names: petsOld.map(p => p.name), authority: "effective_fact",
      predicates: [{ kind: "text_any", terms: ["weight"] }] });
    let calls = 0;
    await assert.rejects(interpretAskQuestion({ context: c, model: "fixture", client: { responses: { create: async () => {
      calls++;return { output_text: JSON.stringify(p) };
    } } } }), e => e.diagnostics?.providerErrorCode === code);
    assert.equal(calls, 1);
  }
});
test("mandatory oversized original USER evidence denies honestly before controlled dispatch", async () => {
  const c = context();c.conversationTurns[0].text = "Juniper " + "x".repeat(135001);
  const f = await ownedPlanningFixture(c);
  let calls = 0;
  await assert.rejects(interpretAskQuestion({ context: f.context, model: "fixture", client: {
    responses: { create: async () => { calls++;throw Error("must not dispatch"); } } } }),
    e => e.reason === "feature_token_budget_exceeded");
  assert.equal(calls, 0);
});
