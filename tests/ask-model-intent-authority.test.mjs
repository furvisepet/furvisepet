import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getFurviseActionPolicy,
  parseModelApplicationActions,
  prepareFurviseApplicationActions,
  shouldAutoExecuteAction,
} from "../app/lib/application-actions/index.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const capability = read("app/lib/application-actions/capabilities.ts");
const planner = read("app/lib/application-actions/planner.ts");
const reasoning = read("app/lib/ai/ask-reasoning.ts");
const migration = read("supabase/migrations/20260820070956_server_authored_ask_action_capabilities.sql");
const hardeningMigration = read("supabase/migrations/20260823120000_harden_ask_action_capability_targets_freshness_expiry.sql");

function modelAction({
  evidence,
  explicitIntent = true,
  input,
  kind,
  sourceMessage,
}) {
  const proposals = parseModelApplicationActions([{
    kind,
    explicitIntent,
    evidence,
    input: {
      field: null,
      value: null,
      title: null,
      detail: null,
      category: null,
      target: null,
      ...input,
    },
  }], sourceMessage);
  return prepareFurviseApplicationActions({
    petId: "11000000-0000-4000-8000-000000000011",
    petName: "Mani",
    proposals,
    requestId: "11000000-0000-4000-8000-000000000201",
    sourceMessage,
  })[0];
}

test("model explicitIntent cannot authorize negated, ambiguous, or generic user language", () => {
  const cases = [
    modelAction({
      evidence: "change Mani's weight",
      input: { field: "weight", value: "4.2 kg", target: "selected" },
      kind: "pet.update_profile",
      sourceMessage: "I don't want to change Mani's weight to 4.2 kg.",
    }),
    modelAction({
      evidence: "add this to the log",
      input: { detail: "Mani vomited once before breakfast.", title: "Vomiting" },
      kind: "care_history.add",
      sourceMessage: "Should I add this to the log? Mani vomited once before breakfast.",
    }),
    modelAction({
      evidence: "yes",
      input: { target: "specified" },
      kind: "care_state.resolve",
      sourceMessage: "yes",
    }),
    modelAction({
      evidence: "resolve",
      input: { target: "specified" },
      kind: "care_state.resolve",
      sourceMessage: "Could this resolve on its own?",
    }),
  ];
  for (const action of cases) {
    assert.ok(action);
    assert.equal(action.explicitIntent, false);
    assert.equal(shouldAutoExecuteAction(action), false);
    assert.equal(action.status, "proposed");
  }
});

test("deterministic authority requires the exact action type, value, and pet semantics", () => {
  const exact = modelAction({
    evidence: "Change Mani's weight to 4.2 kg",
    explicitIntent: false,
    input: { field: "weight", value: "4.2 kg", target: "selected" },
    kind: "pet.update_profile",
    sourceMessage: "Please change Mani's weight to 4.2 kg.",
  });
  assert.equal(exact.explicitIntent, true, "model false cannot veto deterministic user authority");
  assert.equal(shouldAutoExecuteAction(exact), true);

  for (const action of [
    modelAction({
      evidence: "Change Luna's weight to 4.2 kg",
      input: { field: "weight", value: "4.2 kg", target: "selected" },
      kind: "pet.update_profile",
      sourceMessage: "Change Luna's weight to 4.2 kg.",
    }),
    modelAction({
      evidence: "Change Mani's weight to 5 kg",
      input: { field: "weight", value: "4.2 kg", target: "selected" },
      kind: "pet.update_profile",
      sourceMessage: "Change Mani's weight to 5 kg.",
    }),
    modelAction({
      evidence: "Mark it resolved",
      input: { target: "specified" },
      kind: "care_state.reopen",
      sourceMessage: "Mark it resolved.",
    }),
  ]) {
    assert.equal(action.explicitIntent, false);
    assert.equal(shouldAutoExecuteAction(action), false);
  }
});

test("clearly scoped low-risk commands retain their intended auto-execution policy", () => {
  const exactCommands = [
    modelAction({
      evidence: "answer in English",
      input: { field: "preferred_language", value: "English" },
      kind: "memory.set_preference",
      sourceMessage: "Please answer in English.",
    }),
    modelAction({
      evidence: "Log that Mani vomited once before breakfast",
      input: { detail: "Mani vomited once before breakfast.", title: "Vomiting" },
      kind: "care_history.add",
      sourceMessage: "Log that Mani vomited once before breakfast.",
    }),
    modelAction({
      evidence: "Mark it resolved",
      input: { target: "specified" },
      kind: "care_state.resolve",
      sourceMessage: "Mark it resolved.",
    }),
    modelAction({
      evidence: "Reopen that concern",
      input: { target: "specified" },
      kind: "care_state.reopen",
      sourceMessage: "Reopen that concern.",
    }),
  ];
  for (const action of exactCommands) {
    assert.equal(action.explicitIntent, true);
    assert.equal(shouldAutoExecuteAction(action), true);
  }
});

test("model metadata cannot broaden intent or change the server-owned confirmation class", () => {
  const destructive = modelAction({
    evidence: "Delete Mani",
    input: { target: "selected" },
    kind: "pet.delete_permanently",
    sourceMessage: "Delete Mani.",
  });
  assert.equal(destructive.explicitIntent, false);
  assert.equal(destructive.confirmationPolicy, "always");
  assert.equal(destructive.status, "confirmation_required");
  assert.equal(shouldAutoExecuteAction(destructive), false);
  assert.deepEqual(getFurviseActionPolicy("pet.delete_permanently"), {
    authorizationScope: "owned_pet",
    confirmationPolicy: "always",
    mutationClass: "mutation",
    safetyClass: "DESTRUCTIVE",
  });
  assert.doesNotMatch(planner, /proposal\.explicitIntent\s*&&\s*hasServerVerifiedExplicitIntent/);
  assert.match(reasoning, /explicitIntent and evidence are non-authoritative model metadata/);
});

test("capability creation independently re-derives authority from persisted user text", () => {
  assert.match(capability, /loadAuthoritativeSourceMessage/);
  assert.match(capability, /select\("user_text"\)/);
  assert.match(capability, /hasDeterministicUserMutationIntent\(\{ action, petName, sourceMessage \}\)/);
  assert.match(capability, /explicit_intent: authoritativeAction\.explicitIntent/);
  assert.doesNotMatch(capability, /explicit_intent: action\.explicitIntent/);
  assert.match(migration, /p_mode = 'auto'[\s\S]*v\.explicit_intent/);
});

test("target, freshness, expiry, replay, owner, pet, and receipt controls remain unchanged", () => {
  assert.match(migration, /id = p_capability_id and assistant_message_id=p_assistant_message_id and user_id=p_user_id[\s\S]*for update/);
  assert.match(migration, /if v\.status <> 'pending'[\s\S]*return query select v\.receipt, false/);
  assert.match(migration, /where id=v\.target_id and user_id=v\.user_id and pet_profile_id=v\.pet_profile_id/);
  assert.match(hardeningMigration, /v_entry\.updated_at is distinct from v\.target_updated_at/);
  assert.match(hardeningMigration, /v_concern\.updated_at is distinct from v\.target_updated_at/);
  assert.match(hardeningMigration, /v_now >= v\.expires_at/);
  assert.match(hardeningMigration, /interval '15 minutes'/);
});
