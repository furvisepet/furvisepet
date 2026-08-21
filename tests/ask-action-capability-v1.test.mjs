import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const askRoute = read("app/api/ask/route.ts");
const actionRoute = read("app/api/ask/actions/[messageId]/route.ts");
const capability = read("app/lib/application-actions/capabilities.ts");
const conversation = read("app/lib/ask-conversation-server.ts");
const retrieval = read("app/lib/intelligence/retrieve-context.ts");
const migration = read("supabase/migrations/20260820070956_server_authored_ask_action_capabilities.sql");

test("reload and retrieval discard tenant-authored mutation authority and terminal claims", () => {
  assert.match(conversation, /export function presentationOnlyAskResponse/);
  assert.match(conversation, /policy\.mutationClass === "mutation"/);
  assert.match(conversation, /const applicationActions = \[\.\.\.nonMutation, \.\.\.trustedActions\]/);
  assert.match(conversation, /\["action_confirmation", "action_success", "action_failure"\]/);
  assert.match(conversation, /scrubUntrustedMutationClaim/);
  assert.match(conversation, /supportingText: mutationCapable \? null : response\.supportingText/);
  assert.match(conversation, /if \(error\) return result/);
  assert.match(retrieval, /presentationOnlyAskResponse\(message\.response_data, trustedActions\)/);
  assert.match(retrieval, /parseStoredApplicationActions\(trustedActions\)/);
  assert.doesNotMatch(retrieval, /parseStoredApplicationActions\(message\.response_data/);
});

test("confirmation has a capability-only body and neutral guessed, cross-owner, and wrong-message failures", () => {
  assert.match(actionRoute, /hasOnlyKeys\(rawBody, \["actionId", "decision"\]\)/);
  assert.match(actionRoute, /isUuid\(body\.actionId\)/);
  assert.match(actionRoute, /executeActionCapability/);
  assert.match(actionRoute, /if \(!execution\) return unavailable/);
  assert.doesNotMatch(actionRoute, /response_data|action_payload|pet_profile_id/);
  assert.match(migration, /id = p_capability_id and assistant_message_id=p_assistant_message_id and user_id=p_user_id/);
  assert.match(capability, /p_capability_id: input\.capabilityId/);
  assert.match(capability, /p_assistant_message_id: input\.assistantMessageId/);
  assert.match(capability, /p_user_id: input\.userId/);
});

test("capabilities bind immutable owner, messages, pet, exact target, and policy columns", () => {
  for (const column of ["safety_class", "mutation_class", "authorization_scope", "confirmation_policy", "explicit_intent"]) {
    assert.match(migration, new RegExp(`${column} text not null|${column} boolean not null`));
    assert.match(capability, new RegExp(`${column}: authoritativeAction`));
  }
  assert.match(migration, /ACTION_CAPABILITY_IMMUTABLE/);
  assert.match(migration, /action_payload->>'kind' = action_kind/);
  assert.match(migration, /action_payload->>'petId' = pet_profile_id::text/);
  assert.match(migration, /action_payload->>'sourceMessageId' = source_message_id::text/);
  assert.match(migration, /ACTION_CAPABILITY_MESSAGE_BINDING_INVALID/);
  assert.match(migration, /ACTION_CAPABILITY_OWNER_PET_BINDING_INVALID/);
  assert.match(migration, /ask_action_capabilities_target_check/);
  assert.match(migration, /target_updated_at timestamptz/);
  assert.match(migration, /lifecycle_changed_at_at_mint timestamptz/);
});

test("logical retries are unique while multiple actions in one message remain distinct", () => {
  assert.match(migration, /ask_action_capabilities_logical_action_idx[\s\S]*user_id, source_message_id, source_action_id/);
  assert.match(capability, /for \(const action of input\.actions\)/);
  assert.match(capability, /source_action_id: action\.id/);
  assert.match(capability, /eq\("source_action_id", input\.sourceActionId\)/);
  assert.match(capability, /existing\.assistant_message_id !== input\.assistantMessageId/);
  assert.doesNotMatch(migration, /unique[^;]+assistant_message_id\s*\)/i);
});

test("care and concern mutations use their bound target and stale state fails closed", () => {
  assert.match(capability, /bindTarget/);
  assert.match(capability, /requiresBoundTarget/);
  assert.match(migration, /id=v\.target_id and user_id=v\.user_id and pet_profile_id=v\.pet_profile_id/);
  assert.match(migration, /deleted_at is null for update/);
  assert.match(migration, /The original history update is no longer available/);
  assert.match(migration, /The original concern is no longer available/);
  assert.doesNotMatch(migration, /order by occurred_at/);
});

test("row locking, terminal receipts, cancel, and duplicate replay form one concurrency contract", () => {
  assert.match(migration, /where id = p_capability_id[\s\S]*for update/);
  assert.match(migration, /if v\.status <> 'pending'[\s\S]*select v\.receipt, false/);
  assert.match(migration, /p_mode = 'cancel'/);
  assert.match(migration, /status='cancelled',receipt=v_action,terminal_at=v_now/);
  assert.match(migration, /ask_action_capabilities_terminal_check/);
  assert.match(migration, /old\.status <> 'pending'/);
  assert.match(migration, /status=case when v_action->>'status'='succeeded'/);
  assert.match(migration, /p_correction_source_message_id/);
});

test("execution is atomic for care, governed removal, lifecycle history, and concern state", () => {
  for (const kind of ["care_history.add", "care_history.edit", "care_history.remove", "care_state.resolve", "care_state.reopen", "pet.mark_deceased", "pet.mark_active", "pet.archive"]) {
    assert.match(migration, new RegExp(kind.replace(".", "\\.")));
  }
  assert.match(migration, /remove_ask_action_care_entry/);
  assert.match(migration, /deletion_reason = 'user_removed'/);
  assert.match(migration, /intelligence_source_message_id,intelligence_source_type,idempotency_key/);
  assert.match(migration, /ACTION_CAPABILITY_DEATH_HISTORY_REQUIRED/);
  assert.match(migration, /lifecycle_status not in \('deceased','archived'\)/);
  assert.match(migration, /That action is not available yet/);
});

test("only trusted server mode can auto-execute and database exposure is minimum service-only", () => {
  assert.match(migration, /SERVICE_ROLE_REQUIRED/);
  assert.match(migration, /p_mode = 'auto' and not/);
  assert.match(migration, /v\.safety_class = 'LOW_RISK_REVERSIBLE'/);
  assert.match(migration, /v\.confirmation_policy = 'explicit_intent'/);
  assert.match(migration, /v\.explicit_intent/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on public\.ask_action_capabilities from public, anon, authenticated/);
  assert.match(migration, /grant select, insert on public\.ask_action_capabilities to service_role/);
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /grant execute on function public\.execute_ask_action_capability[\s\S]*to service_role/);
  assert.doesNotMatch(askRoute, /executeFurviseApplicationAction/);
});
