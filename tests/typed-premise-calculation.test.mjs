import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  return specifier === "server-only" ? { url: "data:text/javascript,export {};", format: "module", shortCircuit: true } : next(specifier, context);
} });

const { bindCalculatePlan, rebindCalculatePlan, isPremiseOperand } = await import("../app/lib/furvise-brain/calculate-plan.ts");
const { executeCalculatePlan } = await import("../app/lib/furvise-brain/muscle.ts");
const { buildCalculationLabs, calculationPublicationFailure, CALCULATION_LABS } = await import("../app/lib/intelligence/calculation-labs.ts");
const { generateContextAwareAskResponse } = await import("../app/lib/ai/ask-reasoning.ts");
const { validateAskRequest, askRequestProviderSchema } = await import("../app/lib/intelligence/ask-request-contract.ts");
const { publicV1AskCapability } = await import("../app/lib/public-v1-capabilities.ts");

const text = "Aster weighed 10 kg and 20 kg. What is the average weight?";
const source = { id: "u1", role: "user", text };
const rawPlan = {
  operation: "calculate",
  resultSelection: null,
  calculations: [{
    id: "mean_weight",
    operator: "mean",
    operands: [
      { kind: "premise", role: "member", sourceTurnId: null, quote: "10 kg", unit: "kg" },
      { kind: "premise", role: "member", sourceTurnId: null, quote: "20 kg", unit: "kg" },
    ],
    resultUnit: "kg",
    precision: null,
  }],
};

test("CalculatePlan binds exact USER premises without model-supplied values", () => {
  const plan = bindCalculatePlan(rawPlan, null, [], source);
  const operands = plan.calculations[0].operands;
  assert.ok(operands.every(isPremiseOperand));
  assert.deepEqual(operands.map(o => o.source.text), ["10 kg", "20 kg"]);
  assert.deepEqual(operands.map(o => o.exact), [
    { numerator: "10", denominator: "1" },
    { numerator: "20", denominator: "1" },
  ]);
  assert.ok(operands.every(o => !("quote" in o) && !("value" in o)));
  assert.doesNotThrow(() => rebindCalculatePlan(plan, null));
  const execution = executeCalculatePlan(plan, null);
  assert.equal(execution.complete, true);
  assert.equal(execution.results[0].status, "certified");
  assert.equal(execution.results[0].value, 15);
  assert.equal(execution.results[0].unit, "kg");
  assert.deepEqual(execution.results[0].premiseInputs.map(o => o.literal), ["10 kg", "20 kg"]);
  assert.ok(execution.results[0].sourceIds.every(id => id.startsWith("premise:u1:")));
});

test("premise binding is source-exact, dimension-safe, and cannot mix factual domains", () => {
  assert.throws(() => bindCalculatePlan({
    ...rawPlan,
    calculations: [{ ...rawPlan.calculations[0], operands: [
      { kind: "premise", role: "member", sourceTurnId: null, quote: "10 kg", unit: "hour" },
      { kind: "premise", role: "member", sourceTurnId: null, quote: "20 kg", unit: "hour" },
    ], resultUnit: "hour" }],
  }, null, [], source), /ASK_CALCULATE_INVALID:premise_unit/);
  assert.throws(() => bindCalculatePlan({
    ...rawPlan,
    calculations: [{ ...rawPlan.calculations[0], operands: [
      rawPlan.calculations[0].operands[0],
      { role: "member", petName: "Aster", clause: 0, item: 0, field: "measurement", unit: "kg", measurementSelector: null },
    ] }],
  }, null, [{ id: "aster", name: "Aster" }], source), /ASK_CALCULATE_INVALID:mixed_operands/);
  assert.throws(() => bindCalculatePlan(rawPlan, null, [], { ...source, text: "10 kg and another 10 kg" }), /ASK_REQUEST_INVALID:append_span/);
});

test("supplied-context arithmetic is a typed read plan, not conversation prose", () => {
  const pet = { id: "aster", name: "Aster", user_id: "owner", species: "dog" };
  const currentTurn = { id: "u1", role: "user", text, createdAt: "2026-09-25T00:00:00Z" };
  const proposal = {
    version: "ask-request.v2", mode: "read", calculatePlan: rawPlan, readTicket: null,
    question: text, requirements: [], referenceTurnIds: [], evidenceBasis: "supplied_context",
    premiseQuotes: ["10 kg", "20 kg"], excludedPetNames: [], scope: "none", petNames: [],
    operation: "recall", selection: "summary", quantity: "measurement", topic: "calculation",
    terms: [], from: null, to: null, episodeTopic: null, ordinal: null, frame: null,
  };
  const context = { owner: { userId: "owner" }, eligiblePets: [pet], pet, currentMessage: text,
    currentTurn, conversationTurns: [currentTurn], timeZone: "UTC" };
  const interpretation = validateAskRequest(proposal, context);
  assert.equal(interpretation.conversationOnly, undefined);
  assert.equal(interpretation.request.evidenceBasis, "supplied_context");
  assert.equal(interpretation.request.readTicket, null);
  assert.ok(interpretation.request.calculatePlan);
  assert.deepEqual(interpretation.petIds, []);
  const decision = publicV1AskCapability(interpretation.request);
  assert.deepEqual(decision, { available: true, reason: "supported" });
});

test("provider grammar contains a typed supplied-context calculation branch", () => {
  const schema = askRequestProviderSchema({ type: "object" });
  const branches = schema.properties.request.anyOf;
  assert.ok(branches.some(branch => branch.properties?.evidenceBasis?.enum?.includes("supplied_context")
    && branch.properties?.calculatePlan?.type === "object"
    && branch.properties?.readTicket?.type === "null"));
});


test("supplied-context calculation publishes from premise Labs with no history or provider", async () => {
  const pet = { id: "aster", name: "Aster", user_id: "owner", species: "dog" };
  const currentTurn = { id: "u1", role: "user", text, createdAt: "2026-09-25T00:00:00Z" };
  const proposal = {
    version: "ask-request.v2", mode: "read", calculatePlan: rawPlan, readTicket: null,
    question: text, requirements: [], referenceTurnIds: [], evidenceBasis: "supplied_context",
    premiseQuotes: ["10 kg", "20 kg"], excludedPetNames: [], scope: "none", petNames: [],
    operation: "recall", selection: "summary", quantity: "measurement", topic: "calculation",
    terms: [], from: null, to: null, episodeTopic: null, ordinal: null, frame: null,
  };
  const context = { owner: { userId: "owner" }, eligiblePets: [pet], pet, currentMessage: text,
    currentTurn, conversationTurns: [currentTurn], timeZone: "UTC" };
  const interpretation = validateAskRequest(proposal, context);
  const evidence = {
    version: "ask-evidence.v1", interpretation, petNames: {},
    scope: { authorizedPetIds: [], requestedTopic: "calculation", requestText: text,
      requestedPeriod: { kind: "unspecified", surface: null }, requestKind: "ordinary",
      status: "resolved", readOnlyRecall: true },
    sources: [], represented: [], losses: [], verifiedFacts: [], representation: "complete",
    completeness: { retrieval: "unknown", corrections: "unknown", extraction: "unknown", grouping: "unknown" },
  };
  let calls = 0;
  const client = { responses: { create: async () => { calls++; throw Error("PROVIDER_FORBIDDEN"); } } };
  const response = await generateContextAwareAskResponse({ question: text, profiles: [pet], careEntries: [],
    memories: [], productFeedback: [], conversationTurns: [], recentUpdates: [], evidenceContract: evidence, client });
  assert.equal(calls, 0);
  assert.equal(response.model, CALCULATION_LABS);
  assert.ok(response.calculationLabs);
  assert.equal(response.calculationLabs.sourceDomain, "supplied_context");
  assert.equal(response.calculationLabs.readLabs, null);
  assert.match(response.answer.summary, /15 kg/);
  assert.equal(calculationPublicationFailure(response), null);
  const direct = buildCalculationLabs(response.evidenceContract, []);
  assert.ok(direct);
  assert.equal(direct.execution.results[0].value, 15);
});
