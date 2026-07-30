import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260728060000_idempotent_state_suggestions.sql");
const suggestionRoute = read("app/api/ask/suggestions/[id]/route.ts");
const conversationRoute = read("app/api/ask/conversations/[id]/route.ts");
const conversationServer = read("app/lib/ask-conversation-server.ts");
const askRoute = read("app/api/ask/route.ts");
const askPage = read("app/ask/page.tsx");
const intelligence = read("app/lib/intelligence/run-intelligence.ts");
const safetyState = read("app/lib/intelligence/safety-state.ts");

test("new improvement suggestions apply through one transactional RPC", () => {
  assert.match(suggestionRoute, /rpc\("apply_furvise_state_suggestion"/);
  assert.match(migration, /for update/);
  assert.match(migration, /'applied'/);
});

test("double clicks create at most one care entry", () => {
  assert.match(migration, /pet_care_entries_state_suggestion_unique/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(askPage, /uiStatus === "saving"/);
});

test("request retries reuse a matching state effect", () => {
  assert.match(migration, /pet_care_entries_state_effect_unique/);
  assert.match(migration, /state_source_message_id = v_suggestion\.source_message_id/);
});

test("already-applied suggestions return a successful canonical result", () => {
  assert.match(migration, /v_suggestion\.status = 'saved'[\s\S]*'already_applied'/);
  assert.match(suggestionRoute, /alreadyAppliedResponse/);
});

test("already-resolved concerns are successful no-ops", () => {
  assert.match(migration, /v_concern\.status = 'resolved' or v_concern\.resolved_at is not null[\s\S]*v_was_applied := true/);
  assert.doesNotMatch(suggestionRoute, /This concern could not be resolved/);
});

test("existing matching care entries are reused", () => {
  assert.match(migration, /entry_row\.state_suggestion_id = v_suggestion\.id/);
  assert.match(migration, /coalesce\(v_suggestion\.care_entry_id, v_entry_id\)/);
});

test("automatic persistence prevents active suggestion creation", () => {
  assert.match(askRoute, /confirmedCarePersistence\?\.status === "persisted"/);
  assert.match(askRoute, /confirmedCarePersistence\.careEntryIds\.length > 0/);
  assert.match(askRoute, /!automaticCareAction && !automaticCareFailure && suggestion/);
  assert.match(askRoute, /persistenceMode/);
});

test("conversation loading reconciles stale suggestions", () => {
  assert.match(conversationRoute, /reconcileAskSuggestions/);
  assert.match(conversationServer, /effectAlreadyPresent/);
  assert.match(conversationServer, /status: "saved" as const/);
});

test("applied suggestions render a saved confirmation", () => {
  assert.match(askPage, /"Added to care history"/);
  assert.match(askPage, /"Already added to care history"/);
});

test("apply failures render inline recovery", () => {
  assert.match(askPage, /uiStatus: "failed"/);
  assert.match(askPage, /"Try again"/);
  assert.match(askPage, /role="status"/);
});

test("apply failure leaves the assistant response in the thread", () => {
  const handler = askPage.slice(askPage.indexOf("async function applyStateSuggestion"), askPage.indexOf("return (", askPage.indexOf("async function applyStateSuggestion")));
  assert.doesNotMatch(handler, /suggestion: null/);
  assert.match(handler, /updateMessageSuggestion/);
});

test("apply failure cannot escape as an unhandled rejection", () => {
  const handler = askPage.slice(askPage.indexOf("async function applyStateSuggestion"), askPage.indexOf("return (", askPage.indexOf("async function applyStateSuggestion")));
  assert.match(handler, /catch \(applyError\)/);
  assert.match(handler, /finally/);
  assert.doesNotMatch(handler, /throw applyError/);
  assert.match(askPage, /\.catch\(\(\) => undefined\)/);
});

test("another user's suggestion cannot be applied", () => {
  assert.match(migration, /v_suggestion\.user_id <> p_user_id[\s\S]*SUGGESTION_FORBIDDEN/);
  assert.match(suggestionRoute, /SUGGESTION_FORBIDDEN/);
});

test("invalid suggestions return 422 with a stable code", () => {
  assert.match(suggestionRoute, /SUGGESTION_INVALID/);
  assert.match(suggestionRoute, /status: 422/);
  assert.match(migration, /errcode = '22023', message = 'SUGGESTION_INVALID'/);
});

test("database failures use stable friendly errors and internal diagnostics", () => {
  assert.match(suggestionRoute, /SUGGESTION_PERSISTENCE_FAILED/);
  assert.match(suggestionRoute, /operationStage/);
  assert.match(suggestionRoute, /rpcErrorCode/);
  assert.match(suggestionRoute, /existingCareEntryId/);
});

test("resolved concerns can recur", () => {
  assert.match(safetyState, /recentlyResolvedConcerns\.length > 0/);
  assert.match(intelligence, /buildRecurrenceAction/);
  assert.match(migration, /status = 'reopened'/);
  assert.match(migration, /reopened_at = new\.occurred_at/);
});

test("recurrence preserves earlier resolution events", () => {
  assert.doesNotMatch(migration, /delete from public\.pet_care_entries/);
  assert.match(migration, /insert into public\.pet_care_entries/);
  assert.match(migration, /resolved_at = null/);
});

test("a later recovery can create a distinct chronological event", () => {
  assert.match(migration, /state_source_message_id/);
  assert.match(migration, /occurred_at/);
  assert.match(migration, /state_action_type/);
});

test("conversation copy cannot claim resolution while confirmation is pending", () => {
  assert.match(askRoute, /reconcileResponsePersistenceCopy/);
  assert.match(askRoute, /persistenceMode !== "automatic"/);
  assert.match(askRoute, /sounds improved/);
});

test("refresh restores automatic and manually saved canonical state", () => {
  assert.match(conversationRoute, /intelligence_source_message_id/);
  assert.match(conversationRoute, /automaticPersistenceByMessage/);
  assert.match(conversationServer, /automaticSaveConfirmation/);
});

test("pending suggestions are deduplicated by source effect and concern", () => {
  assert.match(migration, /ai_update_suggestions_pending_effect_unique/);
  assert.match(migration, /ai_update_suggestions_pending_concern_unique/);
  assert.match(askRoute, /pendingForConcern/);
});
