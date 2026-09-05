import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAskAnswerEconomy,
  canonicalizeAnswerProse,
  normalizeAskListIntegrity,
  planAskAnswerDepth,
} from "../app/lib/ai/ask-answer-economy.ts";
import { orchestrateAskTurn } from "../app/lib/ai/ask-orchestrator.ts";
import { buildResolutionSuggestion, isPendingUpdateSuggestionGrounded } from "../app/lib/ai/concern-engine.ts";
import { analyzeOwnerAssertions, isOwnerAssertedEvidence, isOwnerCertainEvidence } from "../app/lib/ai/owner-assertion.ts";
import { classifyUserTurn } from "../app/lib/ai/turn-classifier.ts";
import { buildExplicitCareHistoryAction, evaluateCareHistorySaveWorthiness } from "../app/lib/intelligence/care-history-policy.ts";
import { evaluateCareActionPolicy, evaluateLearningPolicy } from "../app/lib/intelligence/memory-policy.ts";
import { governCanonicalEvents } from "../app/lib/intelligence/semantic-events.ts";
import { allowsProposedRecoveryPresentation } from "../app/lib/intelligence/safety-state.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";
import { validateGeneratedAnswer } from "../app/lib/intelligence/validation/validate-answer.ts";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";

const activeHidingConcern = {
  id: "concern-hiding",
  user_id: "owner-1",
  pet_profile_id: "pet-1",
  title: "Hiding",
  normalized_key: "hiding",
  status: "active",
  severity: "important",
  source_care_entry_id: "care-1",
  opened_at: "2026-08-18T10:00:00.000Z",
  updated_at: "2026-08-19T10:00:00.000Z",
  resolved_at: null,
  resolution_note: null,
};

const activeVomitingConcern = {
  ...activeHidingConcern,
  id: "concern-vomiting",
  title: "Vomiting",
  normalized_key: "vomiting",
};

test("answer economy never leaves a decimal tail after removing a redundant fact", () => {
  const result = applyAskAnswerEconomy({
    summary: "His weight was 27.8 kg in the most recent note.",
    sections: [{ heading: "Recent measurements", items: ["His weight was 27.8 kg."] }],
    safetyNote: null,
  }, planAskAnswerDepth({ message: "What was his most recent weight?" }));

  const items = result.sections.flatMap((section) => section.items);
  assert.ok(items.length === 0 || items.includes("His weight was 27.8 kg."));
  assert.doesNotMatch(items.join(" "), /(?:^|\s)8 kg\.?$/);
});

test("sentence and list normalization preserve decimal doses and abbreviated dates", () => {
  const result = normalizeAskListIntegrity({
    summary: "The visit was documented.",
    sections: [{
      heading: "Plan",
      items: ["The visit was Aug. 19. Track the 2.5 mg dose. Call the clinic if vomiting returns."],
    }],
    safetyNote: null,
  });

  assert.deepEqual(result.sections[0].items, [
    "The visit was Aug. 19.",
    "Track the 2.5 mg dose.",
    "Call the clinic if vomiting returns.",
  ]);
  const twoDates = "The visits were Aug. 19. and Sep. 20. in the record.";
  assert.equal(canonicalizeAnswerProse(twoDates), twoDates);
});

test("semantic deduplication preserves overlapping facts with different numbers, negation, or uncertainty", () => {
  const result = applyAskAnswerEconomy({
    summary: "His weight was 27.8 kg and he was eating normally. He needs 2.5 mg daily.",
    sections: [{
      heading: "Earlier note",
      items: [
        "His weight was 28.1 kg at the prior visit.",
        "He was not eating normally on Aug. 19.",
        "He may need 2.5 mg daily.",
      ],
    }],
    safetyNote: null,
  }, { ...planAskAnswerDepth({ message: "Compare his recent notes and doses." }), maxBullets: 4 });

  const rendered = result.sections.flatMap((section) => section.items).join(" ");
  assert.match(rendered, /28\.1 kg/);
  assert.match(rendered, /not eating normally on Aug\. 19/);
  assert.match(rendered, /may need 2\.5 mg/);
});

test("semantic deduplication preserves dates and subject-value-date relationships", () => {
  const differentMonth = applyAskAnswerEconomy({
    summary: "His weight was 28 kg in June.",
    sections: [{ heading: "Later measurement", items: ["His weight was 28 kg in July."] }],
    safetyNote: null,
  }, planAskAnswerDepth({ message: "Compare his June and July weights." }));
  assert.match(differentMonth.sections.flatMap((section) => section.items).join(" "), /28 kg in July/);

  const differentSubject = applyAskAnswerEconomy({
    summary: "Milo weighed 28 kg in June.",
    sections: [{ heading: "Luna", items: ["Luna weighed 28 kg in June."] }],
    safetyNote: null,
  }, planAskAnswerDepth({ message: "Compare Milo and Luna." }));
  assert.match(differentSubject.sections.flatMap((section) => section.items).join(" "), /Luna weighed 28 kg/);

  const swappedRelationships = applyAskAnswerEconomy({
    summary: "Milo weighed 28 kg in June and Luna weighed 20 kg in July.",
    sections: [{ heading: "Correction", items: ["Milo weighed 20 kg in July and Luna weighed 28 kg in June."] }],
    safetyNote: null,
  }, { ...planAskAnswerDepth({ message: "Compare both pets' measurements." }), maxBullets: 2 });
  assert.match(swappedRelationships.sections.flatMap((section) => section.items).join(" "), /Milo weighed 20 kg in July/);
});

test("final answer validation preserves factual punctuation instead of emitting fragments", () => {
  const result = validateGeneratedAnswer(reasoning({
    answer: {
      title: "Recent measurements",
      summary: "His weight was 27.8 kg in the most recent note.",
      sections: [{ heading: "Recent measurements", items: ["His weight was 27.8 kg.", "The visit was Aug. 19."] }],
      safetyNote: null,
    },
  }), validationContext("What was his weight at the Aug. 19 visit?"), "routine", ["pet-1"]);

  assert.equal(result.valid, true);
  assert.doesNotMatch(JSON.stringify(result.response.answer), /\"8 kg\./);
  assert.match(JSON.stringify(result.response.answer), /Aug\. 19/);
});

test("pure resolution and recall questions do not assert owner updates", () => {
  const resolution = classifyUserTurn("Is her hiding problem resolved?", { hasActiveConcern: true });
  assert.equal(resolution.intent, "question");
  assert.equal(resolution.indicatesResolution, false);
  assert.notEqual(resolution.concernState, "resolved");

  const recall = classifyUserTurn("How many separate stomach-upset episodes have I actually reported for him?");
  assert.equal(recall.intent, "question");
});

test("real resolution, correction, and mixed observation-question turns retain their update meaning", () => {
  assert.equal(classifyUserTurn("She stopped hiding yesterday.", { hasActiveConcern: true }).intent, "resolution");
  assert.equal(classifyUserTurn("Actually, he prefers salmon, not chicken.").intent, "correction");
  const mixed = classifyUserTurn("She stopped hiding yesterday. Is that improvement?", { hasActiveConcern: true });
  assert.equal(mixed.intent, "resolution");
  assert.equal(mixed.concernState, "resolved");
});

test("negated and hypothetical recovery language cannot resolve a concern downstream", async () => {
  for (const message of [
    "He has not stopped vomiting.",
    "He hasn't stopped vomiting.",
    "Vomiting has not stopped.",
    "He might have stopped vomiting, but I'm not sure.",
    "Maybe the vomiting stopped after breakfast.",
    "If he stopped vomiting, I would be relieved.",
    "If she stopped hiding, I would be relieved.",
  ]) {
    const turn = classifyUserTurn(message, { hasActiveConcern: true });
    assert.notEqual(turn.concernState, "resolved", message);
    const suggestion = buildResolutionSuggestion({ concern: activeVomitingConcern, message, petName: "Milo" });
    assert.equal(isPendingUpdateSuggestionGrounded({
      suggestion, message, hasActiveConcern: true, concern: activeVomitingConcern,
      activeConcerns: [activeVomitingConcern], petId: "pet-1", petName: "Milo",
    }), false, message);
    const result = await orchestrateAskTurn({
      concerns: [activeVomitingConcern], generationInput: {}, message, petName: "Milo",
      generate: async () => reasoning(),
    });
    assert.notEqual(result.suggestion?.type, "concern_resolution", message);
  }
});

test("uncertainty and conditional scope cannot be stripped from coordinated recovery evidence", async () => {
  for (const message of [
    "I think he stopped vomiting.",
    "I believe he stopped vomiting.",
    "He probably stopped vomiting after breakfast.",
    "He stopped vomiting, I think.",
    "He stopped vomiting, I guess.",
    "He stopped vomiting, but I'm not completely sure.",
    "I think he stopped hiding and he stopped vomiting.",
    "If he stopped hiding and he stopped vomiting, I would be relieved.",
    "I would be relieved if he stopped vomiting.",
    "Suppose he stopped hiding and then stopped vomiting; that would be encouraging.",
  ]) {
    const turn = classifyUserTurn(message, { hasActiveConcern: true });
    assert.notEqual(turn.concernState, "resolved", message);
    const suggestion = buildResolutionSuggestion({ concern: activeVomitingConcern, message, petName: "Milo" });
    assert.equal(isPendingUpdateSuggestionGrounded({
      suggestion,
      message,
      hasActiveConcern: true,
      concern: activeVomitingConcern,
      petId: "pet-1",
      petName: "Milo",
    }), false, message);
    const result = await orchestrateAskTurn({
      concerns: [activeVomitingConcern], generationInput: {}, message, petName: "Milo",
      generate: async () => reasoning(),
    });
    assert.notEqual(result.suggestion?.type, "concern_resolution", message);
  }

  assert.equal(isOwnerAssertedEvidence("I think he vomited after breakfast.", "he vomited after breakfast"), true);
  assert.equal(isOwnerCertainEvidence("I think he vomited after breakfast.", "he vomited after breakfast"), false);
  assert.equal(isOwnerCertainEvidence("He stopped vomiting, I think.", "He stopped vomiting"), false);
  const scoped = analyzeOwnerAssertions("He stopped vomiting, I think.");
  assert.equal(scoped.assertionSpans[0].text, "He stopped vomiting");
  assert.equal(scoped.assertionSpans[0].start, 0);
  assert.equal(scoped.assertionSpans[0].isCertain, false);
  const conditional = analyzeOwnerAssertions("If he stopped hiding and he stopped vomiting, I would be relieved.");
  assert.equal(conditional.clauseSpans[0].isConditional, true);
  assert.equal(conditional.clauseSpans[1].isConditional, true);
  assert.equal(conditional.assertionSpans.some((span) => /stopped (?:hiding|vomiting)/i.test(span.text)), false);
  assert.equal(analyzeOwnerAssertions("He has not stopped vomiting.").clauseSpans[0].isNegated, true);
  const attributed = analyzeOwnerAssertions("You said he stopped hiding and he stopped vomiting.");
  assert.equal(attributed.clauseSpans.every((span) => span.isAttributed), true);
  assert.equal(attributed.hasOwnerAssertion, false);
  assert.equal(evaluateCareHistorySaveWorthiness({
    category: "symptom",
    title: "Possible vomiting",
    details: "Owner was uncertain whether Milo vomited after breakfast.",
    sourceMessage: "I think he vomited after breakfast.",
  }).eligible, true);
});

test("conflicting concern transitions use the latest certain matching state", async () => {
  for (const message of [
    "He stopped vomiting but it started again.",
    "Vomiting stopped, then it came back.",
    "He stopped vomiting. It started again an hour later.",
    "He stopped vomiting, but maybe it started again.",
    "He started vomiting again, but he stopped vomiting this morning.",
  ]) {
    const turn = classifyUserTurn(message, { hasActiveConcern: true });
    assert.notEqual(turn.concernState, "resolved", message);
    const result = await orchestrateAskTurn({
      concerns: [activeVomitingConcern], generationInput: {}, message, petName: "Milo",
      generate: async () => reasoning(),
    });
    assert.notEqual(result.suggestion?.type, "concern_resolution", message);
  }

  for (const message of [
    "He started vomiting again last night, but he stopped vomiting this morning.",
    "The vomiting came back last night. He stopped vomiting after breakfast.",
  ]) {
    const turn = classifyUserTurn(message, { hasActiveConcern: true });
    assert.equal(turn.concernState, "resolved", message);
    const result = await orchestrateAskTurn({
      concerns: [activeVomitingConcern], generationInput: {}, message, petName: "Milo",
      generate: async () => reasoning(),
    });
    assert.equal(result.suggestion?.type, "concern_resolution", message);
  }
});

test("recovery evidence must match the targeted concern while legitimate recovery remains saveable", async () => {
  for (const unrelatedMessage of [
    "She stopped hiding yesterday.",
    "She is good now. She stopped hiding yesterday.",
  ]) {
    const vomitingSuggestion = buildResolutionSuggestion({ concern: activeVomitingConcern, message: unrelatedMessage, petName: "Luna" });
    assert.equal(isPendingUpdateSuggestionGrounded({
      suggestion: vomitingSuggestion, message: unrelatedMessage, hasActiveConcern: true, concern: activeVomitingConcern,
      activeConcerns: [activeVomitingConcern], petId: "pet-1", petName: "Luna",
    }), false);
    const unrelated = await orchestrateAskTurn({
      concerns: [activeVomitingConcern], generationInput: {}, message: unrelatedMessage, petName: "Luna",
      generate: async () => reasoning(),
    });
    assert.notEqual(unrelated.suggestion?.type, "concern_resolution");
  }

  for (const message of [
    "He stopped vomiting this morning.",
    "The vomiting stopped after breakfast.",
    "He stopped vomiting this morning, should I keep monitoring?",
  ]) {
    const suggestion = buildResolutionSuggestion({ concern: activeVomitingConcern, message, petName: "Milo" });
    assert.equal(isPendingUpdateSuggestionGrounded({
      suggestion, message, hasActiveConcern: true, concern: activeVomitingConcern,
      activeConcerns: [activeVomitingConcern], petId: "pet-1", petName: "Milo",
    }), true, message);
    const result = await orchestrateAskTurn({
      concerns: [activeVomitingConcern], generationInput: {}, message, petName: "Milo",
      generate: async () => reasoning(),
    });
    assert.equal(result.suggestion?.type, "concern_resolution", message);
  }
});

test("resolution grounding treats the owned concern as authority, not suggestion metadata", async () => {
  const hidingMessage = "She stopped hiding yesterday.";
  const forged = buildResolutionSuggestion({ concern: activeVomitingConcern, message: hidingMessage, petName: "Luna" });
  forged.title = "Save this improvement";
  forged.payload.title = "Hiding resolved";
  forged.payload.resolvedConcernKeys = ["hiding"];
  assert.equal(isPendingUpdateSuggestionGrounded({
    suggestion: forged,
    message: hidingMessage,
    hasActiveConcern: true,
    concern: activeVomitingConcern,
    petId: "pet-1",
    petName: "Milo",
  }), false);

  const vomitingMessage = "Milo stopped vomiting this morning.";
  assert.equal(isPendingUpdateSuggestionGrounded({
    suggestion: forged,
    message: vomitingMessage,
    hasActiveConcern: true,
    concern: activeVomitingConcern,
    petId: "pet-1",
    petName: "Milo",
  }), false); // Correct evidence cannot authorize a forged persisted topic/key.
  assert.equal(isPendingUpdateSuggestionGrounded({
    suggestion: forged,
    message: "Coco stopped vomiting this morning.",
    hasActiveConcern: true,
    concern: activeVomitingConcern,
    petId: "pet-1",
    petName: "Milo",
  }), false);

  const ambiguous = await orchestrateAskTurn({
    concerns: [activeVomitingConcern, activeHidingConcern],
    generationInput: {},
    message: "She is doing well now.",
    petName: "Luna",
    generate: async () => reasoning(),
  });
  assert.notEqual(ambiguous.suggestion?.type, "concern_resolution");
});

test("automatic concern resolution validates evidence against the authoritative concern", () => {
  const modelClaimsResolution = {
    userIsProvidingUpdate: true,
    userIsResolvingConcern: true,
    userIsCorrectingPriorInformation: false,
  };
  const unrelatedAction = {
    action: "resolve_concern", category: "symptom", title: "Limping resolved", details: "He stopped limping yesterday.",
    severity: "routine", confidence: 0.99, relatedRecordId: activeVomitingConcern.id,
  };
  assert.equal(evaluateCareActionPolicy({
    actions: [unrelatedAction], currentMessage: "He stopped limping yesterday.", understanding: modelClaimsResolution,
    safetyLevel: "recently_resolved", activeConcernIds: [activeVomitingConcern.id],
    activeConcerns: [activeVomitingConcern], petId: "pet-1", petName: "Milo",
  }).accepted.length, 0);

  const vomitingAction = {
    ...unrelatedAction,
    category: "symptom",
    title: "Vomiting resolved",
    details: "Milo stopped vomiting this morning.",
  };
  assert.equal(evaluateCareActionPolicy({
    actions: [vomitingAction], currentMessage: "Milo stopped vomiting this morning.", understanding: modelClaimsResolution,
    safetyLevel: "recently_resolved", activeConcernIds: [activeVomitingConcern.id],
    activeConcerns: [activeVomitingConcern], petId: "pet-1", petName: "Milo",
  }).accepted.length, 1);
});

test("safety signals survive mixed questions without becoming persistence authority", async () => {
  for (const message of [
    "He collapsed, what should I do?",
    "He collapsed; should I call the vet?",
    "He collapsed — what now?",
  ]) {
    const turn = classifyUserTurn(message, { hasActiveConcern: true });
    assert.equal(turn.immediateEmergency, true, message);
    assert.equal(turn.concernState, "worsening", message);
    let providerCalls = 0;
    const result = await orchestrateAskTurn({
      concerns: [activeVomitingConcern], generationInput: {}, message, petName: "Milo",
      generate: async () => { providerCalls += 1; return reasoning(); },
    });
    assert.equal(result.handledWithoutAi, true, message);
    assert.equal(result.safetyLevel, "urgent", message);
    assert.equal(providerCalls, 0, message);
  }
});

test("mixed punctuation preserves an independently asserted recovery clause", async () => {
  for (const message of [
    "She stopped hiding yesterday, is that improvement?",
    "She stopped hiding yesterday; is that improvement?",
    "She stopped hiding yesterday — should I keep watching her?",
  ]) {
    const assertion = analyzeOwnerAssertions(message);
    assert.equal(assertion.hasOwnerAssertion, true, message);
    assert.match(assertion.assertionText, /stopped hiding/i, message);
    const turn = classifyUserTurn(message, { hasActiveConcern: true });
    assert.equal(turn.concernState, "resolved", message);
    const result = await orchestrateAskTurn({
      concerns: [activeHidingConcern], generationInput: {}, message, petName: "Luna",
      generate: async () => reasoning(),
    });
    assert.equal(result.suggestion?.type, "concern_resolution", message);
  }
});

test("evidence grounding is limited to independently supported spans", () => {
  const mixedQuestion = "Milo weighs 28 kg. Does he prefer salmon?";
  assert.equal(isOwnerAssertedEvidence(mixedQuestion, "Milo weighs 28 kg."), true);
  assert.equal(isOwnerAssertedEvidence(mixedQuestion, mixedQuestion), false);
  assert.equal(isOwnerAssertedEvidence(mixedQuestion, "he prefer salmon"), false);

  for (const message of [
    "Milo weighs 28 kg and you said he prefers salmon.",
    "Milo weighs 28 kg, but according to his history he prefers salmon.",
    "Milo weighs 28 kg; Furvise noted that he prefers salmon.",
  ]) {
    assert.equal(isOwnerAssertedEvidence(message, "Milo weighs 28 kg"), true, message);
    assert.equal(isOwnerAssertedEvidence(message, "he prefers salmon"), false, message);
    assert.equal(isOwnerAssertedEvidence(message, message), false, message);
  }

  const twoAssertions = "Milo weighs 28 kg and he prefers salmon.";
  assert.equal(isOwnerAssertedEvidence(twoAssertions, "Milo weighs 28 kg"), true);
  assert.equal(isOwnerAssertedEvidence(twoAssertions, "he prefers salmon"), true);

  const uncertainPreference = "Milo weighs 28 kg and he might prefer salmon.";
  assert.equal(isOwnerCertainEvidence(uncertainPreference, "Milo weighs 28 kg"), true);
  assert.equal(isOwnerAssertedEvidence(uncertainPreference, "he might prefer salmon"), true);
  assert.equal(isOwnerCertainEvidence(uncertainPreference, "he might prefer salmon"), false);
  const uncertainLearning = {
    subjectType: "pet", subjectId: "pet-1", category: "food_preference", factKey: "preferred_flavor",
    factValue: "might prefer salmon", confidence: 0.99, importance: "medium", durability: "durable", action: "create",
    sourceExcerpt: "he might prefer salmon",
  };
  assert.equal(evaluateLearningPolicy([uncertainLearning], uncertainPreference, ["pet-1"]).accepted.length, 0);
});

test("orchestration never offers memory or resolution saves for pure questions", async () => {
  const correctionQuestion = await orchestrateAskTurn({
    concerns: [],
    generationInput: {},
    message: "How many separate stomach-upset episodes have I actually reported for him?",
    petName: "Milo",
    generate: async () => reasoning(),
  });
  assert.equal(correctionQuestion.suggestion, null);

  const resolutionQuestion = await orchestrateAskTurn({
    concerns: [activeHidingConcern],
    generationInput: {},
    message: "Is her hiding problem resolved?",
    petName: "Luna",
    generate: async () => reasoning({
      proposedHistoryUpdate: {
        shouldOffer: true,
        category: "behavior",
        title: "Hiding resolved",
        details: "Her hiding problem resolved.",
        severity: "mild",
        resolvesConcernId: activeHidingConcern.id,
      },
    }),
  });
  assert.equal(resolutionQuestion.suggestion, null);
});

test("historical recall and assistant-attributed history cannot create a new suggestion", async () => {
  for (const message of [
    "Did I report that he vomited on Aug. 19?",
    "You said he vomited on Aug. 19. Is that in his history?",
    "“He vomited on Aug. 19.” Is that in his history?",
  ]) {
    const result = await orchestrateAskTurn({
      concerns: [],
      generationInput: {},
      message,
      petName: "Milo",
      generate: async () => reasoning({
        proposedHistoryUpdate: {
          shouldOffer: true,
          category: "symptom",
          title: "Vomiting",
          details: "He vomited on Aug. 19.",
          severity: "mild",
          resolvesConcernId: null,
        },
      }),
    });
    assert.equal(result.suggestion, null, message);
  }
});

test("legitimate resolution and correction suggestions remain available", async () => {
  const resolution = await orchestrateAskTurn({
    concerns: [activeHidingConcern], generationInput: {}, message: "She stopped hiding yesterday.", petName: "Luna",
    generate: async () => reasoning(),
  });
  assert.equal(resolution.suggestion?.type, "concern_resolution");

  const correction = await orchestrateAskTurn({
    concerns: [], generationInput: {}, message: "Actually, he prefers salmon, not chicken.", petName: "Milo",
    generate: async () => reasoning(),
  });
  assert.equal(correction.suggestion?.type, "memory");
});

test("legacy learning and care-action policies reject question-derived mutations despite model labels", () => {
  const question = "Does Milo actually prefer salmon?";
  const learning = {
    subjectType: "pet", subjectId: "pet-1", category: "food_preference", factKey: "preferred_flavor",
    factValue: "prefers salmon", confidence: 0.99, importance: "medium", durability: "durable", action: "create",
    sourceExcerpt: question,
  };
  assert.equal(evaluateLearningPolicy([learning], question, ["pet-1"]).accepted.length, 0);
  const attributedHistory = "You said Milo prefers salmon.";
  assert.equal(evaluateLearningPolicy([
    { ...learning, sourceExcerpt: attributedHistory },
  ], attributedHistory, ["pet-1"]).accepted.length, 0);

  const resolutionQuestion = "Is her hiding problem resolved?";
  const action = {
    action: "resolve_concern", category: "behavior", title: "Hiding resolved", details: "hiding problem resolved",
    severity: "routine", confidence: 0.99, relatedRecordId: activeHidingConcern.id,
  };
  const modelClaimsResolution = {
    userIsProvidingUpdate: true,
    userIsResolvingConcern: true,
    userIsCorrectingPriorInformation: false,
  };
  assert.equal(evaluateCareActionPolicy({
    actions: [action], currentMessage: resolutionQuestion, understanding: modelClaimsResolution,
    safetyLevel: "recently_resolved", activeConcernIds: [activeHidingConcern.id],
  }).accepted.length, 0);

  assert.equal(allowsProposedRecoveryPresentation({
    activeConcernIds: [activeHidingConcern.id],
    confidence: "high",
    resolvesConcernId: activeHidingConcern.id,
    shouldOffer: true,
    userIsResolvingConcern: true,
    safety: {
      level: "monitor",
      activeConcernIds: [activeHidingConcern.id],
      recentlyResolvedConcernIds: [],
      concernMessageState: "unrelated",
      currentMessageConcernTags: [],
      currentMessageEmergency: false,
      shoppingSuppressed: false,
    },
  }), false);
});

test("semantic event governance rejects a history-recall question as persistence evidence", () => {
  const message = "Did Luna vomit on Aug. 19?";
  const result = governCanonicalEvents({
    proposals: [{
      subject: { type: "pet", name: "Luna" }, domain: "health", topic: "vomiting", eventTitle: "Vomiting",
      transition: "confirmed", state: "historical", temporal: { occurredAt: null, explicitTime: "Aug. 19" },
      importance: "important", confidence: 0.99, sourceExcerpt: message,
    }],
    message,
    pet: { id: "pet-1", name: "Luna" },
    activeEpisodes: [],
  });
  assert.equal(result.accepted.length, 0);
});

test("V2 extractive evidence inside a question is not persistence authority", () => {
  const message = "Does Luna prefer salmon?";
  const turn = governSemanticTurnV2({
    frame: {
      schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
      frameLocalId: "frame_1",
      discourseActs: [{ kind: "statement", confidence: 0.99 }],
      mentions: [{
        localId: "pet_1", surface: "Luna", coarseType: "animal",
        attributes: { species: "dog", lifeStage: null, ownership: "owned" },
        evidence: [{ surfaceText: "Luna" }], confidence: 0.99,
      }],
      references: [],
      claims: [{
        localId: "claim_1", kind: "preference", subjectRef: "pet_1",
        predicate: concept("food preference"), polarity: "affirmed", modality: "asserted",
        temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
        uncertainty: { confidence: 0.99, reasons: [] }, evidence: [{ surfaceText: message }],
        persistenceHint: "pet_memory", preference: "prefer",
        object: { concept: concept("salmon"), value: "salmon" }, constraints: [],
      }],
      uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
    },
    sourceMessage: message,
    sourceMessageId: "message-1",
    ownerId: "owner-1",
    pets: [{ id: "pet-1", name: "Luna", species: "dog" }],
  });

  assert.equal(turn.acceptedClaims.length, 1);
  assert.equal(turn.acceptedClaims[0].persistenceEligible, false);
});

test("explicit save requests still create the intended owner-authorized action", () => {
  const action = buildExplicitCareHistoryAction({
    currentMessage: "Can you save that to her care history?",
    conversationTurns: [{ role: "user", text: "She stopped hiding yesterday." }],
    pet: { name: "Luna" },
  });
  assert.equal(action?.action, "create_entry");
  assert.match(action?.details || "", /explicitly asked to save/i);

  const message = "Remember that Milo prefers salmon, not chicken.";
  const learning = {
    subjectType: "pet", subjectId: "pet-1", category: "food_preference", factKey: "preferred_flavor",
    factValue: "prefers salmon, not chicken", confidence: 0.99, importance: "medium", durability: "durable", action: "create",
    sourceExcerpt: message,
  };
  assert.equal(evaluateLearningPolicy([learning], message, ["pet-1"]).accepted.length, 1);

  const questionForm = "Can you remember that Milo prefers salmon, not chicken?";
  assert.equal(evaluateLearningPolicy([{ ...learning, sourceExcerpt: questionForm }], questionForm, ["pet-1"]).accepted.length, 1);
});

function reasoning(overrides = {}) {
  return {
    answer: { title: "Furvise", summary: "Here is the answer.", sections: [], safetyNote: null },
    userIntent: "question",
    relevantContextIds: [],
    referencedRecords: [],
    safetyLevel: "normal",
    shoppingSuppressed: false,
    suggestedFollowUps: [],
    proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null },
    responseMode: "practical_guidance",
    model: "mock-provider",
    messageUnderstanding: {},
    intelligenceSafety: { level: "routine", reason: "", requiresImmediateAction: false, shoppingSuppressed: false },
    learnings: [],
    careActions: [],
    semanticEvents: [],
    intelligenceMetadata: { confidence: "high", usedPetContext: true, usedCareHistory: true, usedMemories: true },
    ...overrides,
  };
}

function validationContext(currentMessage) {
  return {
    currentMessage,
    pet: { id: "pet-1", name: "Milo", sex: "male", species: "dog" },
    eligiblePets: [{ id: "pet-1", name: "Milo", sex: "male", species: "dog" }],
    memories: [],
    careEntries: [],
  };
}

function concept(label) {
  return { label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] };
}
