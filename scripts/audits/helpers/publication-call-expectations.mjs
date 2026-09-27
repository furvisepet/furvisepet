import assert from 'node:assert/strict';

// Neither wording nor an expected provider draft determines authority.
// Unsupported ordinary-history dimensions are still inside the mandatory boundary.
// Other domains retain their existing call budgets, including explicit null opt-outs.
export async function assertPublicationCalls({ result, context, requests, reviewRequests,
  expectedProviderCalls, expectedReviewCalls, expectedCalculationModel = "server-calculation-labs", history = false, historyStages = [] }) {
  const reasoning = result.reasoning, evidence = reasoning.evidenceContract;
  const interpretation = evidence?.interpretation, request = interpretation?.request;
  const ordinary = request?.mode === 'read' && request.evidenceBasis === 'saved_history'
    && reasoning.safetyLevel !== 'urgent' && reasoning.responseMode !== 'grief_support';
  if (reasoning.model === 'server-profile-presentation-unavailable') {
    const { profilePresentationLimitationFailure } = await import('../../../app/lib/intelligence/profile-presentation-limitation.ts');
    assert.equal(profilePresentationLimitationFailure(reasoning), null);
    assert.equal(requests.length, 0); assert.equal(reviewRequests.length, 0);
    assert.equal(result.answerValidation.valid, true);
    assert.equal(result.answerValidation.assessment.outcome, 'limited');
    return reasoning.model;
  }
  if (request?.calculatePlan) {
    const {calculationPublicationFailure}=await import('../../../app/lib/intelligence/calculation-labs.ts');
    assert.equal(requests.length,0);assert.equal(reviewRequests.length,0);
    assert.equal(reasoning.model,expectedCalculationModel);
    assert.equal(calculationPublicationFailure(reasoning),null);
    assert.equal(result.answerValidation.valid,true);
    if (expectedCalculationModel === "server-calculation-unavailable") {
      assert.equal(reasoning.calculationLabs,undefined);assert.deepEqual(reasoning.relevantContextIds,[]);
      assert.equal(result.answerValidation.assessment.outcome,"limited");
    } else assert.deepEqual(reasoning.calculationLabs.calculatePlan,request.calculatePlan);
    assert.deepEqual(result.acceptedCareActions,[]);assert.deepEqual(result.acceptedLearnings,[]);assert.deepEqual(result.acceptedSemanticEvents,[]);
    return reasoning.model;
  }
  if (!ordinary) {
    if (expectedProviderCalls !== null) assert.equal(requests.length, expectedProviderCalls,
      expectedProviderCalls === 1 ? 'exactly one mocked answer-provider call' : 'explicit bounded mocked provider call count');
    if (expectedReviewCalls !== null) assert.equal(reviewRequests.length, expectedReviewCalls, 'bounded history-review call count');
    return 'existing-domain-expectations';
  }

  assert.ok(['server-labs-list', 'server-history-unavailable'].includes(reasoning.model),
    'ordinary history must use an authoritative deterministic publication path');
  assert.equal(requests.length, 0, 'ordinary history cannot invoke factual generation or repair');
  assert.equal(reviewRequests.length, 0, 'ordinary history cannot invoke factual model review');
  assert.deepEqual(request.readTicket, context.askInterpretation.request.readTicket,
    'publication preserves the canonical typed ticket');
  if (history) {
    assert.ok(historyStages.indexOf('history_retrieval') >= 0
      && historyStages.indexOf('history_retrieval') < historyStages.indexOf('answer_generation'),
      'the real retrieval stage must run before publication');
    if (request.readTicket) {
      assert.ok(context.askHistory?.coverage.ticketCoverage, 'ticket retrieval must produce organ coverage');
      assert.deepEqual(evidence.history.ticketCoverage, context.askHistory.coverage.ticketCoverage,
        'publication uses actual organ coverage');
    }
  }
  const { historyLabsAuthorityFailure, historyLimitationFailure } = await import('../../../app/lib/intelligence/ordinary-history-publication.ts');
  assert.equal(result.answerValidation.valid, true, 'deterministic publication must pass final validation');
  assert.deepEqual(result.acceptedCareActions, []);
  assert.deepEqual(result.acceptedLearnings, []);
  assert.deepEqual(result.acceptedSemanticEvents, []);
  if (reasoning.model === 'server-labs-list') {
    assert.equal(historyLabsAuthorityFailure(reasoning), null, 'Labs transport must match existing organ authority and snapshot');
    assert.deepEqual(reasoning.labsList.ticket, request.readTicket);
    assert.deepEqual(reasoning.labsList.coverage, evidence.history.ticketCoverage);
    assert.deepEqual(reasoning.relevantContextIds, reasoning.labsList.records.map(row => row.sourceId));
    if (history) for (const row of reasoning.labsList.records) {
      const transported = context.askHistory.entries.find(entry => entry.id === row.id);
      assert.ok(transported, 'every published row must survive the actual retrieval');
      assert.equal(row.petId, transported.pet_profile_id);
      assert.equal(row.event_at, transported.occurred_at);
    }
  } else {
    assert.equal(historyLimitationFailure(reasoning), null, 'unavailable history must remain the exact source-free limitation');
    assert.equal(result.answerValidation.assessment.outcome, 'limited');
    assert.deepEqual(reasoning.relevantContextIds, []);
    assert.equal(reasoning.referencedRecords?.length || 0, 0);
  }
  return reasoning.model;
}

/** Retired factual carriers must preserve retrieval without publishing any of its facts. */
export function assertSourceFreePublication(run) {
  const result=run.result.reasoning, validation=run.result.answerValidation;
  assert.ok(['server-history-unavailable','server-profile-presentation-unavailable'].includes(result.model));
  assert.equal(validation.valid,true);assert.equal(validation.assessment.outcome,'limited');
  assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
  assert.deepEqual(result.relevantContextIds,[]);assert.equal(result.referencedRecords?.length||0,0);
  assert.equal(result.labsList,undefined);assert.equal(result.profileFieldLabs,undefined);
  assert.equal(result.historyNarrative,undefined);assert.equal(result.proposedHistoryUpdate.shouldOffer,false);
  assert.deepEqual(run.result.acceptedCareActions,[]);assert.deepEqual(run.result.acceptedSemanticEvents,[]);
  assert.deepEqual(run.result.acceptedLearnings,[]);assert.equal(run.publication.failure,null);
  assert.equal(run.publication.displayed.summary,result.answer.summary);
}
