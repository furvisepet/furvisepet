import {certifiedHistoryRead} from "./helpers/certified-history-read.mjs";
import {assertStoredPublicationUnavailable} from "./helpers/unsupported-stored-publication.mjs";
function recordFixture(rows){return {scope:{authorizedPetIds:["pet-mani"],requestText:"Typed records."},petNames:{"pet-mani":"Mani"},represented:rows.map(r=>({sourceId:"care:"+r.id,sourceType:"care_update",petId:r.pet_profile_id,text:r.note,occurredAt:r.occurred_at,createdAt:r.created_at}))};}
import assert from "node:assert/strict";
import test from "node:test";

import {
  AskPipelineError,
  ASK_MAX_OUTPUT_TOKENS,
  ASK_PROMPT_CONTEXT_CHAR_BUDGET,
  areAskResponsesMateriallyIdentical,
  askUnifiedJsonSchema,
  buildAskContext,
  buildRankedAskContext,
  clearAskProviderCooldownsForTests,
  generateContextAwareAskResponse,
  getAskModelConfiguration,
  latestNeedScopedCareIds,
  buildAskProviderRequest,
  parseUnifiedResponse,
} from "../app/lib/ai/ask-reasoning.ts";
import { buildRecentAskUpdates } from "../app/lib/ask-safety-context.ts";
import { ensureConfirmedLossAction } from "../app/lib/ai/pet-loss.ts";
import { prepareFurviseApplicationActions } from "../app/lib/application-actions/index.ts";

const now = new Date("2026-07-27T20:00:00Z");
test("mixed stored history cannot enter the conversational provider carrier",async()=>{
 const base=input(),e=buildAskContext(base).promptContext.evidenceContract;
 e.interpretation={request:{mode:"mixed",evidenceBasis:"saved_history",referenceTurnIds:[],evidenceNeeds:[]}};
 e.history={candidateIds:[],provenance:[],reasons:[]};e.scope.readOnlyRecall=false;
 assert.throws(()=>buildAskProviderRequest({evidenceContract:e,contextRecords:[]}),/STORED_STATE_CANNOT_ENTER_LANGUAGE_GENERATION/);
 await assertStoredPublicationUnavailable(e);
 assert.throws(()=>parseUnifiedResponse(JSON.stringify({answerVersion:"mixed-history.v1",historyNarrative:{sentences:[{text:"A stored claim.",sourceIds:["care:one"],calculations:[]}]}}),[]));
});
const maniProductionQuestion = "Mani has been acting restless since the male cat started coming to our door three days ago. She keeps meowing at the door and seems more interested in getting outside. Yesterday I think she drank some water I had left outside, but I’m not completely sure. Today she ate normally and is acting mostly like herself. Based on what you already know about Mani and what I’ve told you recently, what do you think is relevant here, what should I do today, what should I keep an eye on, and is there anything from her history that changes your advice?";

function profile(overrides = {}) {
  return {
    id: "pet-mani", user_id: "user-1", name: "Mani", species: "cat", breed: null,
    age_value: 4, age_unit: "years", weight_value: null, weight_unit: null,
    current_food: "salmon food", main_concern: null, wellness_goal: "general wellness",
    avoid_ingredients: ["chicken"], monthly_budget: null,
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-27T00:00:00Z", ...overrides,
  };
}

function care(overrides = {}) {
  return {
    id: "care-1", user_id: "user-1", pet_profile_id: "pet-mani", category: "general",
    title: "Routine note", note: "Rested after lunch", severity: null,
    occurred_at: "2026-07-27T18:00:00Z", created_at: "2026-07-27T18:01:00Z",
    updated_at: "2026-07-27T18:01:00Z", ...overrides,
  };
}

function input(overrides = {}) {
  const careEntries = overrides.careEntries || [care()];
  return {
    profiles: overrides.profiles || [profile()], careEntries,
    memories: overrides.memories || [], productFeedback: overrides.productFeedback || [], concerns: overrides.concerns || [],
    conversationTurns: overrides.conversationTurns || [], recentUpdates: buildRecentAskUpdates(careEntries, now),
    question: overrides.question || "How much play time is reasonable?", requestId: "11111111-1111-4111-8111-111111111111",
    locale: "en-CA", now, ...overrides,
  };
}

test('latest need scope keeps only the newest candidate from its own query receipt', () => {
  const evidence={scope:{authorizedPetIds:['pet-mani']},interpretation:{request:{evidenceNeeds:[{id:'need:0',order:'latest',petIds:['pet-mani']}]}},
    history:{needs:[{needId:'need:0',petId:'pet-mani',candidateIds:['care:new','care:older'],reason:null}]}};
  const records=[
    {id:'care:new',sourceType:'care_update',petId:'pet-mani',occurredAt:'2026-09-16T05:50:00Z'},
    {id:'care:older',sourceType:'care_update',petId:'pet-mani',occurredAt:'2026-09-10T00:00:00Z'},
    {id:'care:noise',sourceType:'care_update',petId:'pet-mani',occurredAt:'2026-09-17T00:00:00Z'},
  ];
  assert.deepEqual([...latestNeedScopedCareIds(evidence,records)],['care:new']);
});

test('latest saved-note scope uses record chronology without turning it into event time', () => {
  const base={scope:{authorizedPetIds:['pet-mani']},history:{needs:[{needId:'need:0',petId:'pet-mani',candidateIds:['care:new','care:old'],reason:null}]}};
  const records=[
    {id:'care:new',sourceType:'care_update',petId:'pet-mani',occurredAt:null,createdAt:'2026-09-16T05:50:00Z',metadata:{recordedAt:'2026-09-16T05:50:00Z'}},
    {id:'care:old',sourceType:'care_update',petId:'pet-mani',occurredAt:'2026-09-10T00:00:00Z',createdAt:'2026-09-10T00:00:00Z',metadata:{}},
  ];
  const saved={...base,interpretation:{request:{evidenceNeeds:[{id:'need:0',order:'latest',petIds:['pet-mani'],quote:'What is the latest saved note?'}]}}};
  assert.deepEqual([...latestNeedScopedCareIds(saved,records)],['care:new']);
  const event={...base,interpretation:{request:{evidenceNeeds:[{id:'need:0',order:'latest',petIds:['pet-mani'],quote:'What is the latest vomiting event?'}]}}};
  assert.deepEqual([...latestNeedScopedCareIds(event,records)],['care:old']);
});

test("canonical transport preserves distinct event instants on the same UTC day",async()=>{
 const entries=[care({id:"early",occurred_at:"2026-07-27T01:00:00Z"}),care({id:"late",occurred_at:"2026-07-27T18:00:00Z"})];
 const {response}=await certifiedHistoryRead(recordFixture(entries));
 assert.deepEqual(response.labsList.records.map(r=>r.event_at),entries.map(r=>r.occurred_at));
 assert.equal(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Vancouver"}).format(new Date(response.labsList.records[0].event_at)),"2026-07-26");
 assert.equal(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Vancouver"}).format(new Date(response.labsList.records[1].event_at)),"2026-07-27");
});

test("canonical publication preserves the exact dated body and event without lexical date reconstruction",async()=>{
 const row=care({id:"dated",note:"September 12, 2026: Mani played for 17 minutes.",occurred_at:"2026-09-12T00:00:00Z"});
 const {response}=await certifiedHistoryRead(recordFixture([row]));
 assert.equal(response.labsList.records[0].event_at,row.occurred_at);assert.equal(response.labsList.records[0].body,row.note);
 assert.ok(response.answer.summary.includes(row.note));
});

function unified(overrides = {}) {
  return {
    answer: "Short play sessions are a good starting point for Mani.",
    answerSections: [],
    safetyLevel: "normal", suggestedFollowUps: [],
    proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null },
    shoppingSuppressed: false, responseMode: "practical_guidance", userIntent: "routine care",
    relevantContextIds: [], // Conversational generation has no stored factual carrier.
    messageUnderstanding: {
      primaryIntent: "question", secondaryIntents: [], userIsAskingQuestion: true,
      userIsProvidingUpdate: false, userIsCorrectingPriorInformation: false,
      userIsResolvingConcern: false, userIsProvidingPreference: false,
      userIsMakingSmallTalk: false, recoveryStatus: "none", recoveryConfidence: 1,
      recoveryEvidence: { outcome: "none", surfaceText: null, targetConcept: null, confidence: 1 }, requestedTopic: "routine care",
      referencedPet: "Mani", safetyRelevance: "none",
      needsClarification: false, canAnswerDirectly: true,
    },
    intelligenceSafety: {
      level: "routine", reason: "No current safety issue.",
      requiresImmediateAction: false, shoppingSuppressed: false,
    },
    learnings: [], careActions: [], semanticEvents: [],
    intelligenceMetadata: {
      confidence: "high", usedPetContext: true,
      usedCareHistory: false, usedMemories: false,
    },
    ...overrides,
  };
}

function mockClient(outputs) {
  const requests = [];
  return {
    requests,
    responses: { async create(request) { requests.push(request); const output = outputs[Math.min(requests.length - 1, outputs.length - 1)]; if (output instanceof Error) throw output; return { output_text: typeof output === "string" ? output : JSON.stringify(output) }; } },
  };
}

test("source-free interpretation draft reaches independent review without another generation call", async () => {
  const base = input({ profiles: [], careEntries: [], recentUpdates: [], question: "What causes morning dew?" });
  const evidence = buildAskContext(base).promptContext.evidenceContract;
  evidence.scope.authorizedPetIds = [];
  evidence.interpretation = { request: { mode: "conversation", evidenceBasis: "general", requirements: [], referenceTurnIds: [] } };
  const client = mockClient([new Error("SECOND_GENERATION_FORBIDDEN")]);
  const answer = "Dew appears when humid air cools and water vapor condenses onto a surface.";
  const response = await generateContextAwareAskResponse({ ...base, client, evidenceContract: evidence,
    conversationOnly: true, provisionalAnswer: answer });
  assert.equal(client.requests.length, 0);
  assert.equal(response.answer.summary, answer);
  assert.deepEqual(response.relevantContextIds, []);
  assert.deepEqual(response.applicationActions, []);
  await assert.rejects(generateContextAwareAskResponse({ ...base, client, evidenceContract: evidence,
    conversationOnly: true, provisionalAnswer: null }), /ASK_CONVERSATION_DRAFT_UNAVAILABLE/);
  assert.equal(client.requests.length, 0);
});

test("normal questions use one strict structured provider request and no planner call", async () => {
  const client = mockClient([unified()]);
  const result = await generateContextAwareAskResponse({ ...input(), client });
  assert.equal(client.requests.length, 1);
  assert.equal(client.requests[0].text.format.strict, true);
  assert.equal(client.requests[0].text.format.schema.properties.historyNarrative.type,"null");
  assert.equal(client.requests[0].text.format.schema.properties.relevantContextIds.maxItems,0);
  assert.equal(client.requests[0].text.format.name, "furvise_ask_response");
  assert.equal(client.requests[0].max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
  assert.doesNotMatch(client.requests[0].text.format.name, /planner/i);
  assert.equal(result.answer.summary, unified().answer);
});

test("the exact history-aware Mani question fits the supported context budget and completes once", async () => {
  const answer = "The male cat at the door may be relevant to Mani’s restlessness and door-focused meowing, while the outside-water detail remains uncertain. Keep Mani indoors today, refresh her normal indoor water, offer play away from the door, and watch appetite, drinking, urination, energy, vomiting, diarrhea, and whether the restlessness settles. Her normal eating and mostly normal behavior today are reassuring. The supplied history does not establish another cause, so do not invent one; contact a veterinarian if she stops eating, seems unwell, has urinary trouble, or the behavior persists or escalates.";
  const answerSections = [
    { heading: "What to do today", items: ["Keep Mani indoors and refresh her usual indoor water.", "Use play or another calm activity away from the door."] },
    { heading: "What to watch", items: ["Watch appetite, drinking, urination, energy, vomiting, diarrhea, and whether the restlessness settles."] },
  ];
  const client = mockClient([unified({ answer, answerSections })]);
  const result = await generateContextAwareAskResponse({
    ...input({
      profiles: [profile({ sex: "female" })],
      question: maniProductionQuestion,
      conversationTurns: [{ id: "recent-1", role: "user", text: "Mani has been watching the cat outside.", createdAt: "2026-07-27T18:00:00Z" }],
    }),
    client,
  });
  const providerInput = JSON.parse(client.requests[0].input);
  assert.equal(client.requests.length, 1);
  assert.equal(providerInput.currentMessage, maniProductionQuestion);
  assert.ok(client.requests[0].input.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.equal("temperature" in client.requests[0], false);
  assert.deepEqual(client.requests[0].reasoning, { effort: "low" });
  assert.match(result.answer.summary, /male cat at the door/i);
  assert.match(result.answer.summary, /uncertain/i);
  assert.doesNotMatch(result.answer.summary, /diagnos/i);
  assert.deepEqual(result.answer.sections, [
    { heading: "What to do today", items: ["Use play or another calm activity away from the door."] },
  ]);
  assert.doesNotMatch(JSON.stringify(result.answer.sections), /refresh her usual indoor water|Watch appetite, drinking/i);
});

test("simple Ask output remains unsectioned while Level 3 output can use bounded structure", async () => {
  const simple = await generateContextAwareAskResponse({
    ...input({ question: "Can cats eat a tiny piece of plain cooked egg?" }),
    client: mockClient([unified({ answer: "A tiny piece of plain, fully cooked egg is generally fine as an occasional treat for most cats." })]),
  });
  assert.deepEqual(simple.answer.sections, []);
  assert.equal(askUnifiedJsonSchema.properties.answerSections.maxItems, 3);
  assert.equal(askUnifiedJsonSchema.properties.answerSections.items.properties.items.maxItems, 4);
  assert.ok(askUnifiedJsonSchema.required.includes("answerSections"));
});

test("contextual suggestions share the answer call and remain bounded and unique", async () => {
  const suggestions = [
    "Why is Mani still pacing?",
    "What should I watch tonight?",
    "Could this be territorial?",
    "Does anything in Mani's history matter here?",
  ];
  const client = mockClient([unified({ suggestedFollowUps: suggestions })]);
  const result = await generateContextAwareAskResponse({ ...input({ question: maniProductionQuestion }), client });
  assert.equal(client.requests.length, 1);
  assert.deepEqual(result.suggestedFollowUps, suggestions.slice(0, 2));
  assert.equal(askUnifiedJsonSchema.properties.suggestedFollowUps.maxItems, 4);
});

test("long Ask context is ranked and truncated deterministically", () => {
  const careEntries = Array.from({ length: 120 }, (_, index) => care({
    id: `care-${String(index).padStart(3, "0")}`,
    note: `Observation ${index} ${"detail ".repeat(200)}`,
    occurred_at: "2026-07-27T12:00:00Z",
    created_at: "2026-07-27T12:01:00Z",
  }));
  const first = buildAskContext(input({ careEntries, question: maniProductionQuestion }));
  const second = buildAskContext(input({ careEntries: [...careEntries].reverse(), question: maniProductionQuestion }));
  assert.ok(JSON.stringify(first.promptContext).length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.deepEqual(first.records.map((record) => record.id), second.records.map((record) => record.id));
  assert.ok(first.records.length < careEntries.length);
});

test("one primary and optional fallback model replace planner and responder configuration", () => {
  assert.deepEqual(getAskModelConfiguration({ OPENAI_ASK_MODEL: "primary", OPENAI_ASK_FALLBACK_MODEL: "fallback" }), {
    primary: "primary", fallback: "fallback", primaryUsedDefault: false,
  });
});

test("conversational context excludes stored candidates while preserving a bounded USER premise carrier",()=>{
 const careEntries=Array.from({length:20},(_,i)=>care({id:"care-"+i,note:"STORED_NOTE_SENTINEL"}));
 const memories=Array.from({length:12},(_,i)=>({id:"memory-"+i,user_id:"user-1",dog_profile_id:"pet-mani",type:"routine",text:"STORED_MEMORY_SENTINEL",confidence:"high",source:"owner",created_at:"2026-07-20T00:00:00Z"}));
 const context=buildAskContext(input({careEntries,memories}));
 assert.deepEqual(context.records,[]);assert.equal(context.promptContext.olderUpdateSummary,null);
 const payload=buildAskProviderRequest(context.promptContext).input;
 assert.doesNotMatch(payload,/STORED_NOTE_SENTINEL|STORED_MEMORY_SENTINEL/);
 assert.ok(payload.length<=ASK_PROMPT_CONTEXT_CHAR_BUDGET);
});

test("typed predicates and selection retain the latest matching note without prompt relevance ranking",async()=>{
 const entries=[care({id:"latest-food",note:"Started salmon food",occurred_at:"2026-07-27T19:00:00Z"}),...Array.from({length:10},(_,i)=>care({id:"old-nails-"+i,note:"Nails trimmed",occurred_at:"2026-06-"+String(i+1).padStart(2,"0")+"T12:00:00Z"}))];
 const {response}=await certifiedHistoryRead(recordFixture(entries),{predicates:[{kind:"text_any",terms:["salmon"]}],selection:{groupBy:["subject"],union:[{orderBy:[{field:"event_at",direction:"desc"}],take:{count:1,per:"group"}}]}});
 assert.deepEqual(response.relevantContextIds,["care:latest-food"]);assert.equal(response.labsList.records[0].body,entries[0].note);
});

test("canonical event_at selection uses event time rather than insertion time",async()=>{
 const entries=[care({id:"real-latest",occurred_at:"2026-07-27T19:00:00Z",created_at:"2026-07-01T00:00:00Z"}),care({id:"created-latest",occurred_at:"2026-07-20T00:00:00Z",created_at:"2026-07-27T19:30:00Z"})];
 const {response}=await certifiedHistoryRead(recordFixture(entries),{selection:{groupBy:["subject"],union:[{orderBy:[{field:"event_at",direction:"desc"}],take:{count:1,per:"group"}}]}});
 assert.deepEqual(response.relevantContextIds,["care:real-latest"]);
});

test("preloaded active or resolved state cannot become a conversational factual winner",async()=>{
 const active={id:"episode-active",pet_profile_id:"pet-mani",normalized_key:"safety_pet_missing",episode_type:"care_tracking",title:"Pet missing",severity:"urgent",status:"active",sequence_number:1,started_at:"2026-07-27T19:00:00Z"};
 const base=input({activeEpisodes:[active],recentlyResolvedEpisodes:[{...active,id:"episode-resolved",status:"resolved"}],question:"Is Mani still missing?",concernStateHint:"still_active"});
 const context=buildAskContext(base);assert.deepEqual(context.records,[]);
 const e=context.promptContext.evidenceContract;e.episodes={candidates:[active]};
 await assertStoredPublicationUnavailable(e);
});

test("a resolved missing-pet episode does not influence a future unrelated question", () => {
  const resolvedMissing = [{
    id: "episode-found", pet_profile_id: "pet-mani", normalized_key: "safety_missingpet", episode_type: "care_tracking",
    title: "Mani ran away", severity: "urgent", status: "resolved", sequence_number: 1, recurrence_of: null,
    started_at: "2026-07-27T18:00:00Z", last_event_at: "2026-07-27T19:00:00Z", resolved_at: "2026-07-27T19:00:00Z",
    summary: { semanticDomain: "safety", semanticTopic: "missingpet", latestStatus: "resolved" },
  }];
  const records = buildRankedAskContext(input({ recentlyResolvedEpisodes: resolvedMissing, question: "How often should I brush Mani's teeth?" }));
  assert.equal(records.some((record) => record.id === "episode:episode-found"), false);
});

test("current USER emergency forces urgent guidance without stored factual citations",async()=>{
 const entries=[care({id:"breathing",note:"STORED_BREATHING_SENTINEL",severity:"severe"})];
 const client=mockClient([unified({answer:"Contact an emergency veterinarian now. Do not force food while Mani's breathing is abnormal."})]);
 const result=await generateContextAwareAskResponse({...input({careEntries:entries,question:"Mani has open-mouth breathing now. What should I do?"}),client});
 assert.equal(result.safetyLevel,"urgent");assert.equal(result.shoppingSuppressed,true);assert.equal(result.responseMode,"urgent_safety");
 assert.deepEqual(result.relevantContextIds,[]);assert.match(result.answer.summary,/emergency veterinarian/);
 assert.doesNotMatch(client.requests[0].input,/STORED_BREATHING_SENTINEL/);
});

test("an unrelated preference turn is not hijacked by an active urgent concern", async () => {
  const concerns = [{
    id: "concern-vomiting", user_id: "user-1", pet_profile_id: "pet-mani", title: "Vomiting",
    normalized_key: "vomiting", status: "active", severity: "urgent", source_care_entry_id: "vomiting",
    opened_at: "2026-07-27T18:00:00Z", updated_at: "2026-07-27T18:00:00Z", resolved_at: null, resolution_note: null,
  }];
  const result = await generateContextAwareAskResponse({
    ...input({ concerns, question: "I prefer shopping at Chewy.", concernStateHint: "unrelated" }),
    client: mockClient([unified({ answer: "Chewy is now your preferred retailer." })]),
  });
  assert.equal(result.safetyLevel, "normal");
  assert.equal(result.shoppingSuppressed, false);
  assert.notEqual(result.responseMode, "urgent_safety");
  assert.doesNotMatch(result.answer.summary, /emergency veterinarian/i);
});

test("good morning has zero persistence context and no historical urgent spillover", () => {
  const concerns = [{
    id: "concern-vomiting", user_id: "user-1", pet_profile_id: "pet-mani", title: "Vomiting",
    normalized_key: "vomiting", status: "active", severity: "urgent", source_care_entry_id: "vomiting",
    opened_at: "2026-07-27T18:00:00Z", updated_at: "2026-07-27T18:00:00Z", resolved_at: null, resolution_note: null,
  }];
  const context = buildAskContext(input({
    concerns,
    question: "Good morning.",
    concernStateHint: "unrelated",
    turnSemanticFrame: {
      schemaVersion: "furvise.semantic-frame.proposed.v1.5", frameLocalId: "frame_greeting",
      discourseActs: [{ kind: "acknowledgement", confidence: 0.99 }], mentions: [], references: [], claims: [],
      uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
    },
  }));
  assert.equal(context.minimumSafetyLevel, "normal");
  assert.equal(context.records.some((record) => record.sourceType === "active_concern"), false);
  assert.equal(context.promptContext.activeConcernTags.length, 0);
});

test("old resolved urgent context cannot become factual prose or force unrelated emergency advice",async()=>{
 const entries=[care({id:"symptom",note:"Taking deep breaths",occurred_at:"2026-07-27T16:00:00Z"}),care({id:"resolved",note:"Breathing returned to normal after resting",occurred_at:"2026-07-27T17:00:00Z"})];
 const base=input({careEntries:entries,question:"Can Mani eat now?"});assert.deepEqual(buildRankedAskContext(base),[]);
 const client=mockClient([unified()]),result=await generateContextAwareAskResponse({...base,client});
 assert.equal(result.safetyLevel,"normal");assert.doesNotMatch(client.requests[0].input,/Breathing returned to normal|Taking deep breaths/);
});

test("reported improvement can offer a history update without auto-saving it", async () => {
  const proposed = { shouldOffer: true, category: "symptom", title: "Breathing returned to normal", details: "Mani's breathing returned to normal after resting.", severity: "mild", resolvesConcernId: "concern-1" };
  const result = await generateContextAwareAskResponse({ ...input({ question: "Mani is breathing normally now" }), client: mockClient([unified({ answer: "I'm glad Mani's breathing is back to normal. Keep an eye on it for now.", proposedHistoryUpdate: proposed })]) });
  assert.deepEqual(result.proposedHistoryUpdate, proposed);
});

test("casual greetings remain short while retaining the safe structured-output budget", async () => {
  const client = mockClient([unified({ answer: "Hi! How is Mani doing today?", responseMode: "conversational", userIntent: "casual" })]);
  const result = await generateContextAwareAskResponse({ ...input({ question: "yo" }), client });
  assert.equal(result.responseMode, "conversational");
  assert.ok(result.answer.summary.length < 120);
  assert.equal(client.requests[0].max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
});

test("general grief support remains functional without granting a lifecycle mutation",async()=>{
 const question="she ran outside and a dog came and bit her neck and she died";
 const client=mockClient([unified({answer:"I'm so sorry for your loss.",responseMode:"grief_support",safetyLevel:"normal",shoppingSuppressed:true})]);
 const result=await generateContextAwareAskResponse({...input({question}),client});
 assert.equal(client.requests.length,1);assert.equal(result.responseMode,"grief_support");
 assert.match(result.answer.summary,/sorry/);assert.deepEqual(result.applicationActions,[]);
 // Lifecycle persistence requires its canonical transition, not this language carrier.
});

test("loss-context follow-ups remain grief-aware and do not restart emergency treatment", async () => {
  const [pendingLossAction] = prepareFurviseApplicationActions({
    proposals: ensureConfirmedLossAction([], "Mani died after a dog attacked her."),
    petId: "pet-mani",
    petName: "Mani",
    requestId: "request-loss",
  });
  const client = mockClient([unified({
    answer: "I'm sorry. For now, take the next practical step that feels manageable.",
    responseMode: "practical_guidance",
    safetyLevel: "urgent",
    suggestedFollowUps: ["What should I monitor?"],
  })]);
  const result = await generateContextAwareAskResponse({
    ...input({
      profiles: [profile({ lifecycle_status: "active", pronouns: "she/her" })],
      question: "so what now",
      conversationTurns: [
        { id: "loss-user", role: "user", text: "Mani died after a dog attacked her.", createdAt: "2026-08-18T10:00:00Z" },
        {
          id: "loss-answer",
          role: "furvise",
          text: "I'm so sorry.",
          createdAt: "2026-08-18T10:00:01Z",
          applicationActions: [{ ...pendingLossAction, sourceMessageId: "loss-user" }],
        },
      ],
    }),
    client,
  });
  assert.equal(result.responseMode, "grief_support");
  assert.equal(result.safetyLevel, "normal");
  assert.equal(result.shoppingSuppressed, true);
  assert.deepEqual(result.suggestedFollowUps, []);
  assert.deepEqual(result.applicationActions, []);
  assert.doesNotMatch(result.answer.summary, /emergency treatment|monitor her breathing/i);
});

test("an observational assessment question is repaired locally when the model only echoes it", async () => {
  const question = "Is she putting any weight on it, or is she holding the leg up?";
  const client = mockClient([unified({ answer: "Is Mani putting any weight on it, or is Mani holding the leg up?" })]);
  const result = await generateContextAwareAskResponse({
    ...input({ profiles: [profile({ pronouns: "she/her" })], question }),
    client,
  });
  assert.equal(client.requests.length, 1);
  assert.match(result.answer.summary, /non-slip surface/i);
  assert.match(result.answer.summary, /will not bear weight/i);
  assert.notEqual(result.answer.summary, "Is Mani putting any weight on it, or is Mani holding the leg up?");
});

test("a token-based 429 retries once with a distinct fallback model and same request context", async () => {
  const previousPrimary = process.env.OPENAI_ASK_MODEL;
  const previousFallback = process.env.OPENAI_ASK_FALLBACK_MODEL;
  process.env.OPENAI_ASK_MODEL = "primary-model";
  process.env.OPENAI_ASK_FALLBACK_MODEL = "fallback-model";
  const limited = new Error("limited"); limited.status = 429; limited.code = "rate_limit_exceeded"; limited.type = "tokens"; limited.headers = { "retry-after": "0" };
  const client = mockClient([limited, unified()]);
  try {
    const result = await generateContextAwareAskResponse({ ...input(), client });
    assert.equal(client.requests.length, 2);
    assert.equal(client.requests[0].model, "primary-model");
    assert.equal(client.requests[1].model, "fallback-model");
    assert.equal(client.requests[1].max_output_tokens, client.requests[0].max_output_tokens);
    assert.equal(result.model, "fallback-model");
  } finally {
    if (previousPrimary === undefined) delete process.env.OPENAI_ASK_MODEL; else process.env.OPENAI_ASK_MODEL = previousPrimary;
    if (previousFallback === undefined) delete process.env.OPENAI_ASK_FALLBACK_MODEL; else process.env.OPENAI_ASK_FALLBACK_MODEL = previousFallback;
  }
});

test("a requests-based 429 never retries the same or fallback model immediately", async () => {
  clearAskProviderCooldownsForTests();
  const previousPrimary = process.env.OPENAI_ASK_PRIMARY_MODEL;
  const previousFallback = process.env.OPENAI_ASK_FALLBACK_MODEL;
  process.env.OPENAI_ASK_PRIMARY_MODEL = "rate-limited-model";
  process.env.OPENAI_ASK_FALLBACK_MODEL = "other-model";
  const limited = new Error("limited"); limited.status = 429; limited.code = "rate_limit_exceeded"; limited.type = "requests"; limited.headers = { "retry-after": "4" };
  const client = mockClient([limited, unified()]);
  try {
    await assert.rejects(generateContextAwareAskResponse({ ...input(), client }), (error) => error instanceof AskPipelineError && error.stage === "primary_provider_failed" && error.diagnostics.retryAfterMs === 4000);
    assert.equal(client.requests.length, 1);
    await assert.rejects(generateContextAwareAskResponse({ ...input(), client }), (error) => error instanceof AskPipelineError && error.diagnostics.providerErrorType === "requests");
    assert.equal(client.requests.length, 1);
  } finally {
    clearAskProviderCooldownsForTests();
    if (previousPrimary === undefined) delete process.env.OPENAI_ASK_PRIMARY_MODEL; else process.env.OPENAI_ASK_PRIMARY_MODEL = previousPrimary;
    if (previousFallback === undefined) delete process.env.OPENAI_ASK_FALLBACK_MODEL; else process.env.OPENAI_ASK_FALLBACK_MODEL = previousFallback;
  }
});

test("missing or same-model fallback is skipped safely", async () => {
  const previousPrimary = process.env.OPENAI_ASK_PRIMARY_MODEL;
  const previousFallback = process.env.OPENAI_ASK_FALLBACK_MODEL;
  process.env.OPENAI_ASK_PRIMARY_MODEL = "same-model";
  process.env.OPENAI_ASK_FALLBACK_MODEL = "same-model";
  const limited = new Error("limited"); limited.status = 429; limited.code = "rate_limit_exceeded"; limited.type = "tokens";
  const client = mockClient([limited, unified()]);
  try {
    await assert.rejects(generateContextAwareAskResponse({ ...input(), client }), AskPipelineError);
    assert.equal(client.requests.length, 1);
  } finally {
    if (previousPrimary === undefined) delete process.env.OPENAI_ASK_PRIMARY_MODEL; else process.env.OPENAI_ASK_PRIMARY_MODEL = previousPrimary;
    if (previousFallback === undefined) delete process.env.OPENAI_ASK_FALLBACK_MODEL; else process.env.OPENAI_ASK_FALLBACK_MODEL = previousFallback;
  }
});

test("invalid structured output alone triggers one repair call", async () => {
  const client = mockClient(["not-json", unified()]);
  const result = await generateContextAwareAskResponse({ ...input(), client });
  assert.equal(client.requests.length, 2);
  assert.equal(result.answer.summary, unified().answer);
});

test("unsupported terminal recovery is re-read from the current message before response use", async () => {
  const stale = unified({
    answer: "That is reassuring if Mani is back to normal.",
    messageUnderstanding: {
      ...unified().messageUnderstanding,
      primaryIntent: "update",
      recoveryStatus: "terminal",
      recoveryConfidence: 0.92,
      recoveryEvidence: { outcome: "return_to_baseline", surfaceText: "Mani is vomiting", targetConcept: "vomiting", confidence: 0.92 },
      userIsProvidingUpdate: true,
      userIsResolvingConcern: true,
    },
  });
  const current = unified({
    answer: "Mani is vomiting now, so use the current symptom report rather than the older recovery.",
    messageUnderstanding: { ...unified().messageUnderstanding, primaryIntent: "update", userIsProvidingUpdate: true },
  });
  const client = mockClient([stale, current]);
  const result = await generateContextAwareAskResponse({ ...input({ question: "Mani is vomiting" }), client });
  assert.equal(client.requests.length, 2);
  assert.match(JSON.parse(client.requests[1].input).recoveryRepairInstruction, /newest currentMessage/);
  assert.deepEqual(JSON.parse(client.requests[1].input).rejectedRecoveryEvidence, stale.messageUnderstanding.recoveryEvidence);
  assert.match(JSON.parse(client.requests[1].input).recoveryRepairInstruction, /problem_ended or symptom_absent/);
  assert.equal(result.answer.summary, current.answer);
  assert.equal(result.messageUnderstanding.recoveryStatus, "none");
});

test("a materially identical assistant answer is repaired before it can be persisted", async () => {
  const repeated = unified({ answer: "How is Mani breathing right now? Contact an emergency veterinarian if the breathing is still difficult." });
  const contextual = unified({ answer: "I’m glad Mani seems better. Keep an eye on breathing and energy after activity for a little while.", safetyLevel: "monitor" });
  const client = mockClient([repeated, contextual]);
  const result = await generateContextAwareAskResponse({
    ...input({
      question: "she is good",
      concernStateHint: "improved",
      conversationTurns: [{ id: "prior-assistant", role: "furvise", text: repeated.answer, createdAt: "2026-07-27T19:00:00Z" }],
    }),
    client,
  });
  assert.equal(client.requests.length, 2);
  assert.equal(result.answer.summary, contextual.answer);
  assert.equal(areAskResponsesMateriallyIdentical(result.answer.summary, repeated.answer), false);
});

test("unknown gender is neutralized while explicitly saved pronouns are preserved", async () => {
  const neutral = await generateContextAwareAskResponse({ ...input(), client: mockClient([unified({ answer: "She can start with short play sessions." })]) });
  assert.doesNotMatch(neutral.answer.summary, /\bshe\b/i);
  const explicit = await generateContextAwareAskResponse({ ...input({ profiles: [profile({ pronouns: "she/her" })] }), client: mockClient([unified({ answer: "She can start with short play sessions." })]) });
  assert.match(explicit.answer.summary, /\bShe\b/);
});

test("strict pet isolation excludes care rows for pets not supplied by ownership lookup", () => {
  const records = buildRankedAskContext(input({ careEntries: [care(), care({ id: "other", pet_profile_id: "pet-other", note: "Private other pet note" })] }));
  assert.equal(records.some((record) => record.value.includes("Private other pet note")), false);
});

test("untyped episode identity and stored sequence cannot authorize a displayed ordinal",async()=>{
 const episode={id:"stool-second",pet_profile_id:"pet-mani",normalized_key:"stool",episode_type:"symptom",title:"Soft stool",status:"resolved",sequence_number:2,recurrence_of:"stool-first",started_at:"2026-06-01",last_event_at:"2026-06-03"};
 const base=input({recentlyResolvedEpisodes:[episode],question:"Describe Mani's stool history."}),e=buildAskContext(base).promptContext.evidenceContract;
 assert.deepEqual(buildRankedAskContext(base),[]);e.episodes={candidates:[episode]};
 const r=await assertStoredPublicationUnavailable(e);assert.doesNotMatch(r.answer.summary,/second|stool-first/);
 assert.equal(episode.sequence_number,2);assert.equal(episode.recurrence_of,"stool-first");
});

test("event evidence repair preserves an explicit historical date and episode boundary", async () => {
  const assertion = "Mani started a new, separate vomiting episode on 2024-06-09.";
  const question = `${assertion} Please save this to her history.`;
  const event = {
    subject: { type: "pet", name: "Mani" }, domain: "health", topic: "vomiting",
    eventTitle: "Vomiting episode started", transition: "started", state: "historical",
    temporal: { occurredAt: "2024-06-09T00:00:00.000Z", explicitTime: "2024-06-09" },
    importance: "important", confidence: 0.99, sourceExcerpt: assertion,
    episodeBoundary: { kind: "opening", evidence: assertion, confidence: 0.99 },
  };
  const invalid = unified({ semanticEvents: [{ ...event, sourceExcerpt: question }] });
  const valid = unified({ semanticEvents: [event] });
  const client = mockClient([invalid, valid]);
  const result = await generateContextAwareAskResponse({ ...input({ question }), client });
  assert.equal(client.requests.length, 2);
  assert.equal(JSON.parse(client.requests[1].input).rejectedEventEvidence[0].sourceExcerpt, question);
  assert.equal(result.semanticEvents[0].sourceExcerpt, assertion);
  assert.deepEqual(result.semanticEvents[0].temporal, event.temporal);
  assert.deepEqual(result.semanticEvents[0].episodeBoundary, event.episodeBoundary);
});

test("repeated unsupported event evidence fails before it can become a legacy save", async () => {
  const question = "Mani started vomiting on 2024-06-09. Save this to history.";
  const invalid = unified({ semanticEvents: [{
    subject: { type: "pet", name: "Mani" }, domain: "health", topic: "vomiting",
    eventTitle: "Vomiting", transition: "started", state: "historical",
    temporal: { occurredAt: "2024-06-09T00:00:00.000Z", explicitTime: "2024-06-09" },
    importance: "important", confidence: 0.99, sourceExcerpt: "Mani vomited yesterday",
  }] });
  const client = mockClient([invalid, invalid]);
  await assert.rejects(generateContextAwareAskResponse({ ...input({ question }), client }),
    error => error instanceof AskPipelineError && error.diagnostics.providerErrorCode === "ASK_EVENT_EVIDENCE_UNSUPPORTED");
  assert.equal(client.requests.length, 2);
});

test('a completed raw note isolates optional event extraction from its additional answer',async()=>{
 const question='Save this note for Mani: I put the carrier beside the door. Then give me a packing checklist.';
 const base=input({question});const evidence=buildAskContext(base).promptContext.evidenceContract;
 evidence.completedOwnerNote={sourceMessageId:'saved-source',petId:'pet-mani',entryIds:['saved-note']};
 const draft=unified({answer:'Bring the carrier, the medication list, and any requested records.',semanticEvents:[{
  subject:{type:'pet',name:'Mani'},domain:'health',topic:'vomiting',eventTitle:'Vomiting',transition:'started',state:'historical',
  temporal:{occurredAt:null,explicitTime:null},importance:'important',confidence:0.99,sourceExcerpt:'An unsupported optional extraction',
 }]});
 const client=mockClient([draft]);
 const result=await generateContextAwareAskResponse({...base,evidenceContract:evidence,client});
 assert.equal(client.requests.length,1,'optional extraction must not spend the answer repair budget');
 assert.match(result.answer.summary,/carrier/);
 assert.deepEqual(result.semanticEvents,[]);assert.deepEqual(result.careActions,[]);assert.deepEqual(result.learnings,[]);
});

test("inventory diagnostics retain their scope without granting a count publication carrier",async()=>{
 const {recordInventoryEvidence}=await import("../app/lib/intelligence/record-inventory.ts");
 const base=input({careEntries:[],question:"How many saved entries exist in June?"}),e=buildAskContext(base).promptContext.evidenceContract;
 e.recordInventory=[{petId:"pet-mani",count:4,from:"2026-06-01",to:"2026-07-01",checkedAt:"2026-07-27T20:00:00.000Z"}];
 const original=structuredClone(e.recordInventory),source=recordInventoryEvidence(e.recordInventory)[0];
 assert.ok(source.text.includes("2026-06-01"));assert.ok(source.text.includes("2026-07-01"));
 await assertStoredPublicationUnavailable(e);assert.deepEqual(e.recordInventory,original);
});
test("historical action receipts remain server metadata and cannot reopen mixed factual generation",async()=>{
 const e=recordFixture([care({note:"Played with a puzzle toy for 13 minutes."})]);
 e.interpretation={request:{mode:"mixed",evidenceBasis:"saved_history",evidenceNeeds:[],referenceTurnIds:[]}};
 e.operationReceipts=Array.from({length:12},(_,i)=>({sourceMessageId:"old-"+i,petId:"pet-mani",requestText:"Earlier request. ".repeat(20),answerPersisted:true,actionReceipts:[],records:[{id:"old-record-"+i,note:"Earlier observation. ".repeat(40)}]}));
 e.operationReceipts[11].actionReceipts=[{id:"confirmed-edit",kind:"care_history.edit",status:"succeeded",resultMessage:"The history update was edited."}];
 const before=structuredClone(e);await assertStoredPublicationUnavailable(e);
 assert.deepEqual(e,before);assert.equal(e.operationReceipts.length,12);
});
test("typed saved profile name remains authoritative while JSON presentation stays unsupported",async()=>{
 const base=input({careEntries:[],question:"Return the saved profile name and species as JSON."}),e=buildAskContext(base).promptContext.evidenceContract;
 const {evidenceSource}=await import("../app/lib/intelligence/ask-evidence.ts");e.sources=[evidenceSource("pet-mani","profile",["pet-mani"])];
 e.scope.readOnlyRecall=true;e.interpretation={readOnly:true,petIds:["pet-mani"],request:{mode:"read",evidenceBasis:"saved_profile",profileFields:["name","species"],evidenceNeeds:[],referenceTurnIds:[],requirements:[],outputFormat:"json"}};
 const client={responses:{create:async()=>{throw Error("PROFILE_PROVIDER_FORBIDDEN");}}};
 const result=await generateContextAwareAskResponse({...base,evidenceContract:e,client});
 assert.equal(result.model,"server-profile-presentation-unavailable");assert.deepEqual(result.relevantContextIds,[]);
 const {derivePublicationAuthority}=await import("../app/lib/intelligence/publication-authority.ts");
 const authority=derivePublicationAuthority(result.evidenceContract);
 assert.ok(authority.authorizedSourceIds.includes("profile:pet-mani:name"));assert.ok(authority.authorizedSourceIds.includes("profile:pet-mani:species"));
});

test('unsupported optional extraction cannot abort an ordinary medicine clarification',async()=>{
 const question='I give him medicine  yesterday';
 const draft=unified({answer:'What medicine did you give him, and how much?',responseMode:'clarification',semanticEvents:[{
  subject:{type:'pet',name:'Mani'},domain:'health',topic:'medication',eventTitle:'Medicine given',transition:'started',state:'historical',
  temporal:{occurredAt:null,explicitTime:'yesterday'},importance:'important',confidence:0.99,sourceExcerpt:'I gave him 5 mg of a named medicine yesterday.',
 }]});
 const client=mockClient([draft]);
 const result=await generateContextAwareAskResponse({...input({question}),client});
 assert.equal(client.requests.length,1);
 assert.match(result.answer.summary,/What medicine/);
 assert.deepEqual(result.semanticEvents,[]);assert.deepEqual(result.careActions,[]);assert.deepEqual(result.learnings,[]);
 assert.deepEqual(result.applicationActions,[]);assert.equal(result.proposedHistoryUpdate.shouldOffer,false);
});
test('present-tense owner medicine reports retain provenance without authorizing commands or questions',async()=>{
 const {isOwnerAssertedEvidence}=await import('../app/lib/ai/owner-assertion.ts');
 for(const message of ['I give him medicine  yesterday','We give her medicine every evening','She gives him medicine yesterday'])
  assert.equal(isOwnerAssertedEvidence(message,message),true,message);
 for(const message of ['Give him medicine yesterday','Should I give him medicine?','If I give him medicine tomorrow','"I give him medicine yesterday"'])
  assert.equal(isOwnerAssertedEvidence(message,message),false,message);
 assert.equal(isOwnerAssertedEvidence('I give him medicine yesterday','I gave him 5 mg yesterday'),false);
});
