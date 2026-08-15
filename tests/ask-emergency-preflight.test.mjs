import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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

test("normal symptoms and clearly general or human phrasing do not trigger emergency preflight", () => {
  for (const message of [
    "My dog has a mild itchy patch but is eating and acting normally.",
    "What causes seizures in dogs?",
    "Can cats collapse from being tired?",
    "I cannot breathe after my run.",
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
  const preflight = route.indexOf("const immediateEmergency = detectImmediateAskEmergency(question)");
  const providerConfiguration = route.indexOf("const model = getAskModelConfiguration().primary", preflight);
  const semanticExtraction = route.indexOf("await extractTurnSubjectFrame", preflight);
  assert.ok(preflight > -1 && preflight < providerConfiguration && preflight < semanticExtraction);
  assert.match(route.slice(preflight, providerConfiguration), /return standaloneEmergencyResponse/);
});

test("allowance-status failure cannot intercept emergency guidance", () => {
  const preflight = route.indexOf("const immediateEmergency = detectImmediateAskEmergency(question)");
  const entitlementLoad = route.indexOf("await loadAskEntitlementContext(authentication)", preflight);
  const usageLookup = route.indexOf("await getRemainingAiCredits", entitlementLoad);
  assert.ok(preflight > -1 && preflight < entitlementLoad && entitlementLoad < usageLookup);
  const branch = route.slice(preflight, entitlementLoad);
  assert.match(branch, /standaloneEmergencyResponse/);
  assert.doesNotMatch(branch, /getRemainingAiCredits|usage[,}]|remainingCredits/);
});

test("entitlement infrastructure failure cannot intercept emergency guidance", () => {
  const preflight = route.indexOf("const immediateEmergency = detectImmediateAskEmergency(question)");
  const entitlementLoad = route.indexOf("await loadAskEntitlementContext(authentication)", preflight);
  const entitlementRpc = route.indexOf("await resolveEffectiveEntitlements", entitlementLoad);
  assert.ok(preflight > -1 && preflight < entitlementLoad && entitlementLoad < entitlementRpc);
  assert.match(route.slice(preflight, entitlementLoad), /return standaloneEmergencyResponse/);
});

test("malformed or unavailable provider output cannot intercept emergency guidance or consume allowance", () => {
  const preflight = route.indexOf("const immediateEmergency = detectImmediateAskEmergency(question)");
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
  const preflight = route.indexOf("const immediateEmergency = detectImmediateAskEmergency(question)");
  const entitlementLoad = route.indexOf("await loadAskEntitlementContext(authentication)", preflight);
  const idempotency = route.indexOf("claimIdempotentOperation", entitlementLoad);
  const admission = route.indexOf("runAdmittedAiOperation", idempotency);
  const reservation = route.indexOf("await reserveAiCredit", admission);
  assert.ok(preflight < entitlementLoad && entitlementLoad < idempotency && idempotency < admission && admission < reservation);
});

test("the client accepts only the explicit standalone emergency shape without inventing conversation or usage state", () => {
  assert.match(askPage, /payload\?\.handledWithoutAi && payload\.persistence\?\.saved === false && parsed\?\.urgency === "urgent"/);
  assert.match(askPage, /\(!payload\.conversationId && !standaloneEmergency\)/);
  assert.match(askPage, /if \(!standaloneEmergency\) await refreshConversations/);
  assert.match(askPage, /if \(payload\?\.usage\) setUsage/);
  const responseFunction = route.slice(route.indexOf("function standaloneEmergencyResponse"), route.indexOf("function didPersistEffectiveState"));
  assert.doesNotMatch(responseFunction, /usage|remainingCredits|conversationId|userMessageId/);
});
