import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv from "ajv";
import { evidenceSource } from "../app/lib/intelligence/ask-evidence.ts";

import {
  ASK_MAX_OUTPUT_TOKENS,
  AskPipelineError,
  askUnifiedJsonSchema,
  buildAskProviderRequest,
  generateContextAwareAskResponse,
} from "../app/lib/ai/ask-reasoning.ts";
import { interpretStructuredProviderResponse } from "../app/lib/ai/ask-provider.ts";

function profile() {
  return {
    id: "pet-maple", user_id: "user-1", name: "Maple", species: "dog", breed: null,
    age_value: 4, age_unit: "years", weight_value: null, weight_unit: null,
    current_food: null, main_concern: null, wellness_goal: null, avoid_ingredients: [], monthly_budget: null,
    created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z",
  };
}

function providerOutput(overrides = {}) {
  return {
    answer: "Contact an emergency veterinarian now because Maple's extreme tiredness with abnormal breathing after activity can be serious.",
    answerSections: [],
    safetyLevel: "urgent",
    responseMode: "urgent_safety",
    userIntent: "report urgent breathing change",
    relevantContextIds: [],
    historyNarrative: null,
    applicationActions: [],
    messageUnderstanding: {
      primaryIntent: "new_symptom", secondaryIntents: [], userIsAskingQuestion: false,
      userIsProvidingUpdate: true, userIsCorrectingPriorInformation: false,
      userIsResolvingConcern: false, userIsProvidingPreference: false,
      recoveryStatus: "none", recoveryConfidence: 1, recoveryEvidence: { outcome: "none", surfaceText: null, targetConcept: null, confidence: 1 },
      userIsMakingSmallTalk: false, requestedTopic: "breathing", referencedPet: "Maple",
      safetyRelevance: "direct", needsClarification: false, canAnswerDirectly: true,
    },
    semanticEvents: [],
    ...overrides,
  };
}

function input(client, onProviderEvent) {
  return {
    profiles: [profile()], careEntries: [], memories: [], productFeedback: [], concerns: [], recentlyResolvedConcerns: [],
    conversationTurns: [], recentUpdates: [], question: "Maple ran hard outside and now she is extremely tired and taking deep breaths.",
    requestId: "13d00733-5d10-48b1-8e7b-bf834236dbb9", locale: "en-CA", client, onProviderEvent,
  };
}

function clientWith(responses) {
  const requests = [];
  return {
    requests,
    responses: {
      async create(request) {
        requests.push(request);
        return responses[Math.min(requests.length - 1, responses.length - 1)];
      },
    },
  };
}

test("Ask uses one canonical 8192-token native strict structured-output request", () => {
  const request = buildAskProviderRequest({ currentMessage: "hello" });
  assert.equal(ASK_MAX_OUTPUT_TOKENS, 8192);
  assert.equal(request.max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.name, "furvise_ask_response");
  assert.equal(request.text.format.strict, true);
  const schema = request.text.format.schema;
  assert.deepEqual(Object.keys(schema.properties).sort(), ["answer","answerSections","safetyLevel","responseMode","userIntent","applicationActions","relevantContextIds","historyNarrative","messageUnderstanding","semanticEvents"].sort());
  assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  assert.equal(schema.additionalProperties, false);
  const validate = new Ajv({allErrors:true}).compile(schema);
  assert.equal(validate(providerOutput()),true,JSON.stringify(validate.errors));
  assert.equal(schema.properties.historyNarrative.type, "null");
  assert.equal(schema.properties.relevantContextIds.maxItems, 0);
  for (const field of ["answer","safetyLevel","responseMode","userIntent"])
    assert.deepEqual(schema.properties[field], askUnifiedJsonSchema.properties[field]);
  assert.equal("temperature" in request, false);
});

test("Ask applies model-compatible reasoning controls without client-selectable provider options", async () => {
  const client = clientWith([{ status: "completed", output_text: JSON.stringify(providerOutput()) }]);
  await generateContextAwareAskResponse(input(client));
  assert.deepEqual(client.requests[0].reasoning, { effort: "low" });
  assert.equal("temperature" in client.requests[0], false);
  assert.equal("model" in JSON.parse(client.requests[0].input), false);
});

test("a complete structured result larger than the old 2048-character boundary parses once", async () => {
  let parseCount = 0;
  const long = providerOutput({
    answer: `Contact an emergency veterinarian now. ${"Keep Maple quiet and cool while arranging care. ".repeat(30)}`.slice(0, 1750),
    learnings: Array.from({ length: 5 }, (_, index) => ({
      subjectType: "pet", subjectId: "pet-maple", category: "observation", factKey: `explicit_update_${index}`,
      factValue: `Observed update ${index}`, confidence: 0.99, importance: "high", durability: "temporary",
      action: "create", sourceExcerpt: "Maple ran hard outside and now she is extremely tired and taking deep breaths.",
    })),
  });
  const raw = JSON.stringify(long);
  assert.ok(raw.length > 2048);
  const result = interpretStructuredProviderResponse({ status: "completed", output_text: raw }, (text) => {
    parseCount += 1;
    return JSON.parse(text);
  });
  assert.equal(result.status, "completed");
  assert.equal(parseCount, 1);
});

test("known length-limited output is classified as incomplete and never parsed", () => {
  let parseCount = 0;
  const result = interpretStructuredProviderResponse({
    status: "incomplete", output_text: '{"answer":"cut off', incomplete_details: { reason: "max_output_tokens" },
    usage: { input_tokens: 800, output_tokens: 4096 },
  }, () => { parseCount += 1; return {}; });
  assert.equal(result.status, "incomplete");
  assert.equal(result.errorCode, "ASK_OUTPUT_INCOMPLETE");
  assert.equal(result.parsingAttempted, false);
  assert.equal(parseCount, 0);
});

test("refusal and provider failure remain distinct from malformed output", () => {
  const refused = interpretStructuredProviderResponse({
    status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot comply" }] }],
  }, JSON.parse);
  const failed = interpretStructuredProviderResponse({
    status: "failed", error: { code: "provider_error", message: "Generation failed" },
  }, JSON.parse);
  assert.equal(refused.status, "refused");
  assert.equal(refused.errorCode, "ASK_OUTPUT_REFUSED");
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "provider_error");
});

test("one bounded corrected retry can recover from incomplete output", async () => {
  const client = clientWith([
    { status: "incomplete", output_text: '{"answer":"cut off', incomplete_details: { reason: "max_output_tokens" }, usage: { input_tokens: 900, output_tokens: 4096 } },
    { status: "completed", output_text: JSON.stringify(providerOutput()), usage: { input_tokens: 900, output_tokens: 720 } },
  ]);
  const events = [];
  const result = await generateContextAwareAskResponse(input(client, (event) => events.push(event)));
  assert.equal(result.safetyLevel, "urgent");
  assert.equal(client.requests.length, 2);
  assert.equal(client.requests[0].max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
  assert.equal(client.requests[1].max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
  assert.deepEqual(events.map((event) => `${event.stage}:${event.outcome}`), ["primary:started", "primary:failed", "repair:started", "repair:succeeded"]);
  assert.equal(events[1].providerErrorCode, "ASK_OUTPUT_INCOMPLETE");
  assert.equal(events[1].parsingAttempted, false);
});

test("repeated malformed completed output stops after one repair", async () => {
  const client = clientWith([
    { status: "completed", output_text: "not-json" },
    { status: "completed", output_text: '{"still":"invalid"}' },
  ]);
  await assert.rejects(generateContextAwareAskResponse(input(client)), (error) =>
    error instanceof AskPipelineError && error.stage === "fallback_invalid_output" && error.diagnostics.providerErrorCode === "ASK_OUTPUT_INVALID");
  assert.equal(client.requests.length, 2);
});

test("invalid auxiliary sections are dropped without a repair call", async () => {
  const client = clientWith([
    { status: "completed", output_text: JSON.stringify(providerOutput({ answerSections: [{ heading: "What to do", items: [] }] })) },
    { status: "completed", output_text: JSON.stringify(providerOutput({ answerSections: [] })) },
  ]);
  const result = await generateContextAwareAskResponse(input(client));
  assert.deepEqual(result.answer.sections, []);
  assert.equal(client.requests.length, 1);
});

test("provider success is emitted only after parsing and schema validation", async () => {
  const events = [];
  const client = clientWith([{ status: "completed", output_text: JSON.stringify(providerOutput()) }]);
  await generateContextAwareAskResponse(input(client, (event) => events.push(event)));
  assert.deepEqual(events.map((event) => event.outcome), ["started", "succeeded"]);
  assert.equal(events[1].parsingAttempted, true);
});

test("urgent output missing explicit escalation is repaired deterministically", async () => {
  const client = clientWith([{ status: "completed", output_text: JSON.stringify(providerOutput({ answer: "Keep Maple still and monitor breathing closely." })) }]);
  const result = await generateContextAwareAskResponse(input(client));
  assert.match(result.answer.summary, /^Contact an emergency veterinarian now\./);
  assert.equal(client.requests.length, 1);
});

test("the reduced contract bounds metadata while complete prose uses the provider token budget", () => {
  assert.equal(askUnifiedJsonSchema.properties.answer.maxLength, undefined);
  assert.equal(ASK_MAX_OUTPUT_TOKENS, 8192);
  assert.equal(askUnifiedJsonSchema.properties.answerSections.maxItems, 3);
  assert.equal(askUnifiedJsonSchema.properties.answerSections.items.properties.items.maxItems, 4);
  assert.equal(askUnifiedJsonSchema.properties.suggestedFollowUps.maxItems, 4);
  assert.equal(askUnifiedJsonSchema.properties.learnings.maxItems, 5);
  assert.equal(askUnifiedJsonSchema.properties.careActions.maxItems, 3);
  assert.equal(askUnifiedJsonSchema.properties.semanticEvents.maxItems, 4);
  assert.ok(askUnifiedJsonSchema.properties.semanticEvents.items.required.includes("eventTitle"));
  assert.equal("shoppingSuppressed" in askUnifiedJsonSchema.properties, false);
  assert.equal("intelligenceMetadata" in askUnifiedJsonSchema.properties, false);
});

test("structured Ask extraction separates point-in-time chronology from memory and current state", () => {
  const reasoning = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  assert.match(reasoning, /Emit semanticEvents only for occurrences with future care value/);
  assert.match(reasoning, /Do not emit them for jokes, opinions, greetings, generic questions, normal play, chasing butterflies/);
  assert.match(reasoning, /Chronology and memory are independent destinations/);
  assert.match(reasoning, /state=historical for a completed standalone event/);
  assert.match(reasoning, /active or monitoring only when it creates or changes an ongoing temporary state/);
});

test("retained history evidence guards coexist with public read-only publication and durable-before-charge ordering",async()=>{
 const route=readFileSync(new URL("../app/api/ask/route.ts",import.meta.url),"utf8");
 const callback=readFileSync(new URL("../app/lib/intelligence/generate-ask-history.ts",import.meta.url),"utf8");
 assert.ok(callback.indexOf("await retrieveAskHistory(")<callback.indexOf("await runFurviseIntelligence({"));
 assert.match(callback,/evidenceContract: createAskEvidenceContract\(context, readPetIds\)/);
 assert.match(callback,/input\.authoritativePetIds = petIds/);
 const entry=route.indexOf("async function executeAskRequest"),context=route.indexOf("loadReadOnlyContext(",entry);
 const generation=route.indexOf("runReadOnlyAsk({",context),reviewed=route.indexOf("buildReadOnlyPublication(",generation),persisted=route.indexOf("persistReadOnlyAnswer({",reviewed);
 assert.ok(entry>=0&&context>entry&&generation>context&&reviewed>generation&&persisted>reviewed);
 assert.doesNotMatch(route,/generateAskHistoryAnswer\(|finalizeAskPostReview\(|persistIntelligenceLearnings\(|executeActionCapability\(/);
 const {readOnlyPublicationFixture}=await import("./helpers/ask-read-only-publication.mjs");
 const f=await readOnlyPublicationFixture(),response=await f.run(),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.turn.actionCount,0);assert.equal(f.calls,2);
 assert.equal(f.state.finalizationInputs[0].carePersistence.status,"skipped");
 assert.ok(f.events.indexOf("assistant:terminal")<f.events.indexOf("credit:complete"));
});

test("retry UI reuses one logical turn with a new server attempt", () => {
  const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
  const ask = page.slice(page.indexOf("async function ask("), page.indexOf("function editFailedMessage"));
  assert.match(ask, /retry\?\.logicalTurnId \|\| crypto\.randomUUID/);
  assert.match(ask, /askRequestActiveRef\.current/);
  assert.match(ask, /if \(!retry\) setThread/);
  assert.match(ask, /setFailedRequest\(null\)/);
});

test("Ask logs provider calls, output completion details, retry reuse, and credit final state", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  for (const field of ["providerCallCount", "configuredOutputLimit", "outputTokens", "finishReason", "incompleteReason", "parsingAttempted", "creditReservationId", "creditFinalState", "retryReuse"]) {
    assert.match(route, new RegExp(field));
  }
});

test('conversation composer receives original user premises without planner-invented facts or mutation fields', () => {
  const request = buildAskProviderRequest({currentMessage:'What can be known?',
    evidenceContract:{interpretation:{conversationOnly:true,request:{question:'Invented certainty',requirements:['Invent a duration']}}},
    pets:[{id:'selected-pet',name:'Selected pet',weight:73.19}], contextRecords:[{value:'Private saved fact'}],
    dialogueContext:{turns:[{role:'user',text:'Original scenario'},{role:'furvise',text:'Unsupported inference'}]}});
  const payload=JSON.parse(request.input);
  assert.equal(payload.currentMessage,'What can be known?');
  assert.deepEqual(payload.userPremises,[{text:'Original scenario'}]);
  assert.doesNotMatch(request.input,/Invented|Invent a duration|Private saved|73\.19|Unsupported inference/);
  assert.deepEqual(payload.pets,[{id:'selected-pet',name:'Selected pet'}]);
  assert.equal(payload.request.requirements,undefined);
  assert.match(payload.authority,/No saved-state evidence or write-success authority/);
  assert.deepEqual(Object.keys(request.text.format.schema.properties).sort(),['answer','responseMode','safetyLevel','userIntent']);
});
test('requested profile JSON retains its format and receives an honest certified limitation',async()=>{
  const {PROFILE_PRESENTATION_LIMITATION}=await import('../app/lib/intelligence/profile-presentation-limitation.ts');
  const {evidence,input:args,client}=storedInput('saved_profile','ordinary','json');
  assert.throws(()=>buildAskProviderRequest({evidenceContract:evidence}),/STORED_STATE_CANNOT_ENTER_LANGUAGE_GENERATION/);
  const result=await generateContextAwareAskResponse(args);
  assert.equal(result.evidenceContract.interpretation.request.outputFormat,'json');
  assert.equal(result.model,'server-profile-presentation-unavailable');
  assert.equal(result.answer.summary,PROFILE_PRESENTATION_LIMITATION);
  assert.deepEqual(result.relevantContextIds,[]);assert.equal(client.requests.length,0);
});
test('count requests retain typed format and cannot reopen factual generation without certified evidence',async()=>{
  const {historyPublicationLimitation,historyLimitationFailure}=await import('../app/lib/intelligence/ordinary-history-publication.ts');
  for(const outputFormat of ['json','csv','prose']){
    const {evidence,input:args,client}=storedInput('saved_history','count',outputFormat);
    assert.throws(()=>buildAskProviderRequest({evidenceContract:evidence}),/STORED_STATE_CANNOT_ENTER_LANGUAGE_GENERATION/);
    const result=await generateContextAwareAskResponse(args);
    assert.equal(result.evidenceContract.interpretation.request.outputFormat,outputFormat);
    assert.equal(result.answer.summary,historyPublicationLimitation(result.evidenceContract));
    assert.equal(historyLimitationFailure(result),null);
    assert.equal(result.model,'server-history-unavailable');
    assert.deepEqual(result.relevantContextIds,[]);assert.equal(client.requests.length,0);
  }
});


for (const readOnly of [false,true]) test(`current-source provenance survives read-only=${readOnly}`,()=>{
 const question='Compare the saved report with the observation I just described.';
 const request=buildAskProviderRequest({currentMessage:question,evidenceContract:{
  scope:{readOnlyRecall:readOnly,requestKind:'ordinary',authorizedPetIds:['owned-pet'],requestText:question},
  history:{provenance:[],candidateIds:[]},sources:[],losses:[],represented:[],
  interpretation:{request:{mode:readOnly?'read':'mixed',outputFormat:'prose',requirements:[]}}
 }});
 const payload=JSON.parse(request.input);
 assert.equal(payload.currentMessage,question);
 assert.match(payload.authority,/Current USER assertions and supplied premises only/);
 assert.equal(payload.evidenceContract,undefined);
 assert.equal(payload.history,undefined);
});

function storedInput(evidenceBasis,requestKind,outputFormat){
 const pet=profile(),client=clientWith([]);
 const request={mode:'read',evidenceBasis,profileFields:evidenceBasis==='saved_profile'?['species']:[],readTicket:null,
  referenceTurnIds:[],requirements:[],evidenceNeeds:[],outputFormat};
 const evidence={version:'ask-evidence.v1',petNames:{[pet.id]:pet.name},
  scope:{authorizedPetIds:[pet.id],requestText:'Requested saved information',status:'resolved',readOnlyRecall:true,requestKind},
  interpretation:{operation:'recall',readOperation:'recall',readOnly:true,petIds:[pet.id],request},
  sources:[evidenceSource(pet.id,'profile',[pet.id])],represented:[],losses:[],verifiedFacts:[],representation:'complete',
  completeness:{retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown'}};
 return {evidence,client,input:{...input(client),question:evidence.scope.requestText,evidenceContract:evidence}};
}
test('language output cannot publish a supplied saved-state citation',async()=>{
 const {parseUnifiedResponse}=await import('../app/lib/ai/ask-reasoning.ts');
 assert.throws(()=>parseUnifiedResponse(JSON.stringify(providerOutput({relevantContextIds:['profile:pet-maple:species']})),[]),
  /LANGUAGE_PROVIDER_CANNOT_PUBLISH_STORED_FACTS/);
});
