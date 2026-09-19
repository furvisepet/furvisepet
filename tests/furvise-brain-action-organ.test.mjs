import assert from "node:assert/strict";
import test from "node:test";

import { authorizeFurviseActionExecution } from "../app/lib/furvise-brain/action-organ.ts";
import { getFurviseActionPolicy } from "../app/lib/application-actions/policy.ts";

function action(kind, overrides = {}) {
  const policy = getFurviseActionPolicy(kind);
  return {
    id: "proposal:1",
    kind,
    input: { field: null, value: null, title: null, detail: "Pebble ate normally today.", category: null, target: "selected" },
    evidence: "owner command",
    explicitIntent: true,
    petId: "pebble",
    sourceMessageId: "user-turn",
    ...policy,
    status: policy.confirmationPolicy === "always" ? "confirmation_required" : "proposed",
    label: "Action",
    description: "Action",
    href: null,
    resultMessage: null,
    errorMessage: null,
    ...overrides,
  };
}

test("low-risk action may auto execute only from server-verified explicit intent", () => {
  const allowed = authorizeFurviseActionExecution({
    action: action("care_history.add"),
    capabilityId: "capability",
    mode: "auto",
  });
  assert.equal(allowed.mutation.allowed, true);
  assert.equal(allowed.mutation.kind, "record_care");
  assert.equal(allowed.mutation.authorizationSource, "durable_capability");

  assert.throws(() => authorizeFurviseActionExecution({
    action: action("care_history.add", { explicitIntent: false }),
    capabilityId: "capability",
    mode: "auto",
  }), /FURVISE_ACTION_AUTO_NOT_AUTHORIZED/);
});

test("lifecycle actions can never auto execute even when a proposal claims explicit intent", () => {
  assert.throws(() => authorizeFurviseActionExecution({
    action: action("pet.mark_deceased", { explicitIntent: true }),
    capabilityId: "capability",
    mode: "auto",
  }), /FURVISE_ACTION_AUTO_NOT_AUTHORIZED/);

  const confirmed = authorizeFurviseActionExecution({
    action: action("pet.mark_deceased", { explicitIntent: false }),
    capabilityId: "capability",
    mode: "confirm",
  });
  assert.equal(confirmed.mutation.kind, "mark_deceased");
  assert.equal(confirmed.mutation.confirmationRequired, true);
  assert.equal(confirmed.mutation.confirmationSatisfied, true);
  assert.equal(confirmed.mutation.allowed, true);
});

test("explicit UI confirmation can authorize a low-risk proposal without auto intent", () => {
  const confirmed = authorizeFurviseActionExecution({
    action: action("pet.update_profile", { explicitIntent: false }),
    capabilityId: "capability",
    mode: "confirm",
  });
  assert.equal(confirmed.mutation.kind, "update_profile");
  assert.equal(confirmed.mutation.authorizationSource, "transport");
  assert.equal(confirmed.mutation.allowed, true);
});

test("cancelling a capability grants only workflow cancellation authority", () => {
  const cancelled = authorizeFurviseActionExecution({
    action: action("pet.mark_deceased"),
    capabilityId: "capability",
    mode: "cancel",
  });
  assert.equal(cancelled.mutation.kind, "cancel_pending");
  assert.equal(cancelled.mutation.authorizationSource, "transport");
  assert.equal(cancelled.mutation.allowed, true);
});

test("stored action policy drift is rejected before execution", () => {
  assert.throws(() => authorizeFurviseActionExecution({
    action: action("pet.mark_deceased", { confirmationPolicy: "explicit_intent" }),
    capabilityId: "capability",
    mode: "confirm",
  }), /FURVISE_ACTION_POLICY_DRIFT/);
});

test("read and navigation actions cannot enter the mutation organ", () => {
  assert.throws(() => authorizeFurviseActionExecution({
    action: action("pet.read"),
    capabilityId: "capability",
    mode: "confirm",
  }), /FURVISE_ACTION_NOT_MUTATION/);
});
