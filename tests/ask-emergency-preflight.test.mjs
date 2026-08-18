import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ASK_REQUEST_KEYS, buildAskRequestPayload } from "../app/lib/ask-request-contract.ts";
import { buildImmediateEmergencyGuidance, detectImmediateAskEmergency } from "../app/lib/ask-safety-context.ts";

const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const askPage = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");

test("high-confidence emergency classes are detected without pet resolution", () => {
  const cases = [
    ["cannot breathe", "breathing_difficulty"],
    ["One of my pets collapsed and is unresponsive", "collapse"],
    ["There is uncontrolled severe bleeding", "severe_bleeding"],
    ["My dog is having an active seizure right now", "seizure"],
  ];
  for (const [message, tag] of cases) {
    assert.ok(detectImmediateAskEmergency(message)?.tags.includes(tag), message);
  }
});

test("breathing emergency contractions match the exact production reproduction", () => {
  for (const message of ["luna cant breathe", "Luna can't breathe", "my dog cannot breathe"]) {
    assert.deepEqual(detectImmediateAskEmergency(message)?.tags, ["breathing_difficulty"], message);
  }
});

test("normal symptoms and clearly general or human phrasing do not trigger emergency preflight", () => {
  for (const message of [
    "My dog has a mild itchy patch but is eating and acting normally.",
    "What causes seizures in dogs?",
    "Can cats collapse from being tired?",
    "I cannot breathe after my run.",
    "I cant breathe after my run.",
    "My pet stopped seizing and is back to normal.",
  ]) assert.equal(detectImmediateAskEmergency(message), null, message);
});

test("a resolved symptom does not hide a different current emergency", () => {
  const emergency = detectImmediateAskEmergency("The bleeding stopped, but now my dog cannot breathe");
  assert.deepEqual(emergency?.tags, ["breathing_difficulty"]);
  assert.ok(detectImmediateAskEmergency("What is happening? My dog cannot breathe"));
});

test("emergency guidance is calm, action-first, and makes no persistence claim", () => {
  const emergency = detectImmediateAskEmergency("My dog cannot breathe");
  assert.ok(emergency);
  const response = buildImmediateEmergencyGuidance(emergency);
  assert.match(response.summary, /^Contact an emergency veterinarian or clinic now\./);
  assert.match(response.summary, /Do not wait for Furvise to identify the pet/);
  assert.doesNotMatch(JSON.stringify(response), /saved|history|diagnos(?:e|is) as/i);
});

test("provider outage cannot intercept a high-confidence emergency", () => {
  const preflight = route.indexOf("const immediateEmergency = currentLoss === \"confirmed_current\" ? null : detectImmediateAskEmergency(question)");
  const providerConfiguration = route.indexOf("const model = getAskModelConfiguration().primary", preflight);
  const semanticExtraction = route.indexOf("await extractTurnSubjectFrame", preflight);
  assert.ok(preflight > -1 && preflight < providerConfiguration && preflight < semanticExtraction);
  assert.match(route.slice(preflight, providerConfiguration), /return standaloneEmergencyResponse/);
});

test("allowance-status failure cannot intercept emergency guidance", () => {
  const preflight = route.indexOf("const immediateEmergency = currentLoss === \"confirmed_current\" ? null : detectImmediateAskEmergency(question)");
  const entitlementLoad = route.indexOf("await loadAskEntitlementContext(authentication)", preflight);
  const usageLookup = route.indexOf("await getRemainingAiCredits", entitlementLoad);
  assert.ok(preflight > -1 && preflight < entitlementLoad && entitlementLoad < usageLookup);
  const branch = route.slice(preflight, entitlementLoad);
  assert.match(branch, /standaloneEmergencyResponse/);
  assert.doesNotMatch(branch, /getRemainingAiCredits|usage[,}]|remainingCredits/);
});

test("entitlement infrastructure failure cannot intercept emergency guidance", () => {
  const preflight = route.indexOf("const immediateEmergency = currentLoss === \"confirmed_current\" ? null : detectImmediateAskEmergency(question)");
  const entitlementLoad = route.indexOf("await loadAskEntitlementContext(authentication)", preflight);
  const entitlementRpc = route.indexOf("await resolveEffectiveEntitlements", entitlementLoad);
  assert.ok(preflight > -1 && preflight < entitlementLoad && entitlementLoad < entitlementRpc);
  assert.match(route.slice(preflight, entitlementLoad), /return standaloneEmergencyResponse/);
});

test("malformed or unavailable provider output cannot intercept emergency guidance or consume allowance", () => {
  const preflight = route.indexOf("const immediateEmergency = currentLoss === \"confirmed_current\" ? null : detectImmediateAskEmergency(question)");
  const reservation = route.indexOf("await reserveAiCredit", preflight);
  const persistence = route.indexOf("await ensureConversationAndUserMessage", preflight);
  const semanticExtraction = route.indexOf("await extractTurnSubjectFrame", preflight);
  assert.ok(preflight > -1 && preflight < persistence && preflight < reservation && preflight < semanticExtraction);
  const responseFunction = route.slice(route.indexOf("function standaloneEmergencyResponse"), route.indexOf("function didPersistEffectiveState"));
  assert.match(responseFunction, /creditsUsed: 0/);
  assert.match(responseFunction, /persistence: \{ saved: false/);
  assert.match(responseFunction, /handledWithoutAi: true/);
  assert.doesNotMatch(responseFunction, /usage|remainingCredits|conversationId|userMessageId/);
});

test("normal requests still enter entitlement, allowance, and provider admission flow", () => {
  const preflight = route.indexOf("const immediateEmergency = currentLoss === \"confirmed_current\" ? null : detectImmediateAskEmergency(question)");
  const entitlementLoad = route.indexOf("await loadAskEntitlementContext(authentication)", preflight);
  const idempotency = route.indexOf("claimIdempotentOperation", entitlementLoad);
  const admission = route.indexOf("aiAdmission = await admitAiOperation", idempotency);
  const reservation = route.indexOf("await reserveAiCredit", admission);
  assert.ok(preflight < entitlementLoad && entitlementLoad < idempotency && idempotency < admission && admission < reservation);
});

test("zero remaining does not intercept client submission before the authoritative emergency preflight", () => {
  const askFunction = askPage.slice(
    askPage.indexOf("async function ask("),
    askPage.indexOf("function editFailedMessage"),
  );
  const clientGuard = askFunction.indexOf("if (!prompt || composerUnavailable || askRequestActiveRef.current) return");
  const post = askFunction.indexOf('idempotentClientFetch("/api/ask"');
  assert.ok(clientGuard > -1 && post > clientGuard);
  assert.doesNotMatch(askFunction.slice(0, post), /usage\.(?:allowed|remaining)|AI_CREDITS_EXHAUSTED/);

  const preflight = route.indexOf("const immediateEmergency = currentLoss === \"confirmed_current\" ? null : detectImmediateAskEmergency(question)");
  const entitlementLoad = route.indexOf("await loadAskEntitlementContext(authentication)", preflight);
  const quotaGate = route.indexOf("if (!usage.allowed) throw new AiCreditLimitError()", entitlementLoad);
  assert.ok(preflight > -1 && preflight < entitlementLoad && entitlementLoad < quotaGate);
  const emergency = detectImmediateAskEmergency("luna cant breathe");
  assert.ok(emergency);
  assert.match(buildImmediateEmergencyGuidance(emergency).summary, /^Contact an emergency veterinarian or clinic now\./);
});

test("zero remaining normal questions remain blocked by the server quota gate", () => {
  assert.equal(detectImmediateAskEmergency("Should I change Luna's food?"), null);
  const preflight = route.indexOf("const immediateEmergency = currentLoss === \"confirmed_current\" ? null : detectImmediateAskEmergency(question)");
  const quotaGate = route.indexOf("if (!usage.allowed) throw new AiCreditLimitError()", preflight);
  const quotaResponse = route.indexOf('askFailure("AI_CREDITS_EXHAUSTED"', quotaGate);
  assert.ok(preflight > -1 && preflight < quotaGate && quotaGate < quotaResponse);
  assert.match(askPage, /<AskFailureState code=\{failedRequest\.code\}/);
});

test("the Ask request contract has no client-controlled emergency override", () => {
  const payload = buildAskRequestPayload({
    conversationId: null,
    locale: "en-CA",
    message: "luna cant breathe",
    petId: "123e4567-e89b-42d3-a456-426614174001",
    previousResponse: null,
    question: "luna cant breathe",
    requestId: "123e4567-e89b-42d3-a456-426614174000",
  });
  assert.deepEqual(Object.keys(payload).sort(), [...ASK_REQUEST_KEYS].sort());
  assert.equal(Object.hasOwn(payload, "emergency"), false);
  assert.equal(Object.hasOwn(payload, "emergencyBypass"), false);
});

test("the client accepts only the explicit standalone emergency shape without inventing conversation or usage state", () => {
  assert.match(askPage, /payload\?\.handledWithoutAi && payload\.persistence\?\.saved === false && parsed\?\.urgency === "urgent"/);
  assert.match(askPage, /\(!payload\.conversationId && !standaloneEmergency\)/);
  assert.match(askPage, /if \(!standaloneEmergency\) await refreshConversations/);
  assert.match(askPage, /if \(payload\?\.usage\) setUsage/);
  const responseFunction = route.slice(route.indexOf("function standaloneEmergencyResponse"), route.indexOf("function didPersistEffectiveState"));
  assert.doesNotMatch(responseFunction, /usage|remainingCredits|conversationId|userMessageId/);
});
