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
  assert.equal(policy.publicV1RequestIsSupportedAskRead({ mode: "read", readTicket: {} }), true);
  assert.equal(policy.publicV1RequestIsSupportedAskRead({ mode: "read", storedRead: { domain: "memory" } }), true);
  assert.equal(policy.publicV1RequestIsSupportedAskRead({ mode: "read", profileFields: ["weight"] }), true);
  assert.equal(policy.publicV1RequestIsSupportedAskRead({ mode: "conversation", calculatePlan: null }), false);
  assert.equal(policy.publicV1RequestIsSupportedAskRead({ mode: "read", readTicket: {}, calculatePlan: {} }), false);
});
test("Ask blocks typed mutation plans before mutation planner branches", () => {
  const route = read("app/api/ask/route.ts");
  const gate = route.indexOf("publicV1RequestHasExcludedAskMutation(interpretation.request)");
  assert.ok(gate > 0);
  for (const marker of ["if (interpretation.request?.appendJob)","continueLifecyclePlan({","if (interpretation.request?.stateTransitionJob)","if (interpretation.request?.fieldMutationJob)","if (interpretation.request?.removeJob)","const replaceJob = interpretation.request?.writeJob"])
    assert.ok(route.indexOf(marker) > gate, marker);
  assert.match(route, /authorizedLearnings: PUBLIC_V1_CAPABILITIES\.askMutations/);
  const readOnlyGate = route.indexOf("publicV1RequestIsSupportedAskRead(interpretation.request)");
  assert.ok(readOnlyGate > gate);
  assert.ok(readOnlyGate < route.indexOf("continueLifecyclePlan({"));
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
