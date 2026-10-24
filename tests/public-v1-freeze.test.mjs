import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const policy = await import("../app/lib/public-v1-capabilities.ts");
test("public v1 capability policy is deliberately narrow", () => {
  assert.equal(policy.PUBLIC_V1_CAPABILITIES.calculationExecution, false);
  assert.equal(policy.PUBLIC_V1_CAPABILITIES.askMutations, false);
  assert.equal(policy.PUBLIC_V1_CAPABILITIES.vetBriefGeneration, false);
  for (const key of ["appendJob","writeJob","removeJob","fieldMutationJob","stateTransitionJob","task"])
    assert.equal(policy.publicV1RequestHasExcludedAskMutation({ [key]: {} }), true, key);
  assert.equal(policy.publicV1RequestHasExcludedAskMutation({
    lifecyclePlan: { pendingDisposition: "keep", transition: null, requiredSubjectState: "active", authorizationQuote: "Milo" },
  }), false, "read-only lifecycle requirement");
  assert.equal(policy.publicV1RequestHasExcludedAskMutation({
    lifecyclePlan: { pendingDisposition: "keep", transition: { targetPetName: "Milo", toState: "archived" }, requiredSubjectState: null, authorizationQuote: "archive Milo" },
  }), true, "lifecycle transition");
  assert.equal(policy.publicV1RequestHasExcludedAskMutation({
    lifecyclePlan: { pendingDisposition: "cancel", transition: null, requiredSubjectState: null, authorizationQuote: "cancel" },
  }), true, "lifecycle cancellation");
  assert.equal(policy.publicV1RequestHasExcludedAskMutation({ storedRead: { domain: "memory" } }), false);
  assert.equal(policy.publicV1AskCapability({ mode: "read", readTicket: {} }).available, true);
  assert.equal(policy.publicV1AskCapability({ mode: "read", storedRead: { domain: "memory" } }).available, true);
  assert.equal(policy.publicV1AskCapability({ mode: "read", profileFields: ["weight"] }).available, true);
  assert.equal(policy.publicV1AskCapability(undefined).reason, "unplanned");
  assert.equal(policy.publicV1AskCapability({ mode: "conversation", calculatePlan: null }).reason, "unplanned");
  assert.equal(policy.publicV1AskCapability({ mode: "read", readTicket: null, calculatePlan: {} }).reason, "calculation");
});
test("Ask uses one typed capability boundary before mutation executors", async () => {
  const route = read("app/api/ask/route.ts");
  const {assertRouteCapabilityOrdering,assertPublicWrapperParity,assertPublicRouteDenial}=await import("./helpers/owned-context-capability-boundary.mjs");
  assertRouteCapabilityOrdering(route);assertPublicWrapperParity();await assertPublicRouteDenial();
  assert.match(route, /authorizedLearnings: PUBLIC_V1_CAPABILITIES\.askMutations/);
  assert.doesNotMatch(route, /publicV1RequestHasExcludedAskMutation\(interpretation\.request\)/);
  assert.doesNotMatch(route, /publicV1RequestIsSupportedAskRead/);
  assert.match(route, /if \(!PUBLIC_V1_CAPABILITIES\.askMutations\) return \{ applicationActions: \[\], applicationStateChanged: false \};/);
});
test("stored Ask effects and new Vet Brief generation are server-blocked", () => {
  assert.match(read("app/api/ask/actions/[messageId]/route.ts"), /if \(!PUBLIC_V1_CAPABILITIES\.askMutations\) return unavailable\(\);/);
  assert.match(read("app/api/ask/suggestions/[id]/route.ts"), /Ask suggestions cannot change saved information in the public beta/);
  assert.match(read("app/api/vet-briefs/draft/route.ts"), /VET_BRIEF_UNAVAILABLE_PUBLIC_V1/);
  assert.match(read("app/api/vet-briefs/route.ts"), /VET_BRIEF_UNAVAILABLE_PUBLIC_V1/);
});
test("public surfaces do not advertise Ask effects or new Vet Brief generation", () => {
  const ask = read("app/ask/page.tsx");
  assert.match(ask, /PUBLIC_V1_CAPABILITIES\.askMutations[\s\S]*: \["copy"\]/);
  assert.match(ask, /PUBLIC_V1_CAPABILITIES\.askMutations && messageVariant/);
  assert.match(ask, /PUBLIC_V1_CAPABILITIES\.askMutations && response\.applicationActions/);
  assert.doesNotMatch(read("app/components/homepage-client.tsx"), /Prepare a vet brief/);
  assert.doesNotMatch(read("app/pets/[id]/page.tsx"), />VET BRIEF</);
  assert.doesNotMatch(read("app/membership/page.tsx"), /Vet Brief generation/);
});

test("failed/retried Ask adopts durable user identity before canonical reload", () => {
  const page = read("app/ask/page.tsx");
  assert.match(page, /let durableUserMessageId = userMessageId[\s\S]*durableUserMessageId = payload\.userMessageId[\s\S]*reconcileLogicalUserTurn\(current, userMessageId, durableUserMessageId, prompt\)/);
  assert.match(page, /userMessageId: durableUserMessageId/);
  assert.match(page, /message\.id === optimisticId \|\| message\.id === durableId/);
});

test("Ask has no post-Brain raw-English product capability classifier", () => {
  const route = read("app/api/ask/route.ts");
  assert.doesNotMatch(route, /classifyFurviseCapabilityQuestion/);
  assert.doesNotMatch(route, /buildFurviseCapabilityResponse/);
});

// Real public confirmation policy is independent of the engine-only fixture.
test("public confirmation rejects even an owned pending capability before execution",async()=>{
 const {fixture,id}=await import('./helpers/ask-route-ordering.mjs');
 const f=fixture();
 f.rows.ask_action_capabilities.push({id:id(71),user_id:id(1),assistant_message_id:id(61),status:'pending'});
 assert.equal((await f.confirm()).status,404);
 assert.equal(f.state.planner,0);
 assert.equal(f.rows.ask_action_capabilities[0].status,'pending');
 assert.equal(f.rows.pet_care_entries.length,2);
 assert.ok(!f.state.events.includes('heart:execute'));
 assert.ok(!f.state.events.includes('read:ask_action_capabilities'));
});
