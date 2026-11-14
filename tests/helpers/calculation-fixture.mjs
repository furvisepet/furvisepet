// Full-algebra regression fixture ONLY. Install the test-only capability hook
 // before loading the real fixture's module graph; static re-export would load
 // the graph before registerHooks has executed.
 await import("./calculation-engine-policy.mjs");
 const api = await import("./calculation-public-fixture.mjs");
export const {
  assert, test, bindCalculatePlan, rebindCalculatePlan, calculatePlanSchema, CALCULATE_OPERATORS, executeCalculatePlan, bindTypedReadTicket, retrieveReadTicket, validateAskRequest, askRequestProviderSchema, generateContextAwareAskResponse, buildLabsList, buildCalculationLabs, calculationPublicationFailure, reviewHistoricalAnswer, validateGeneratedAnswer, finalizeAskAnswer, buildGovernedAskExecutionPlan, resolveSafetyState, pets, row, rows, clause, rawTicket, slot, calculation, proposal, envelope, fixture, finish,
} = api;
