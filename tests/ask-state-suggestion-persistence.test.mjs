import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260923213727_bind_ask_suggestions_to_canonical_jobs.sql");
const suggestionRoute = read("app/api/ask/suggestions/[id]/route.ts");
const conversationRoute = read("app/api/ask/conversations/[id]/route.ts");
const conversationServer = read("app/lib/ask-conversation-server.ts");
const askRoute = read("app/api/ask/route.ts");
const askPage = read("app/ask/page.tsx");
const continuation = read("app/lib/intelligence/canonical-suggestion-continuation.ts");
const canonical = read("app/lib/intelligence/canonical-suggestion.ts");
const safetyState = read("app/lib/intelligence/safety-state.ts");

test("canonical suggestions execute through the exact governed capability", () => {
  assert.match(suggestionRoute, /continueCanonicalSuggestion/);
  assert.match(continuation, /executeActionCapability/);
  assert.match(migration, /for update/);
  assert.match(migration, /public.execute_ask_action_capability/);
  assert.doesNotMatch(suggestionRoute, /apply_furvise_server_state_suggestion/);
});

test("double clicks preserve capability identity and disable duplicate UI submission", () => {
  assert.match(migration, /ai_update_suggestions_canonical_capability_unique/);
  assert.match(migration, /on conflict/);
  assert.match(askPage, /uiStatus === "saving"/);
});

test("retries use exact receipt identity rather than matching state effects", () => {
  assert.match(canonical, /c.receipt.id !== c.id/);
  assert.match(canonical, /isDeepStrictEqual\(meaning\(c.receipt\), meaning\(c.action_payload\)\)/);
});

test("already-applied suggestions return the existing governed receipt", () => {
  assert.match(migration, /ask_suggestion_receipt_succeeded/);
  assert.match(suggestionRoute, /"already_applied"/);
});

test("matching concern state alone cannot establish suggestion success", () => {
  assert.match(canonical, /c.status !== "succeeded"/);
  assert.match(canonical, /!c.terminal_at/);
  assert.doesNotMatch(conversationServer, /effectAlreadyPresent/);
});

test("linked care entries cannot replace canonical receipt verification", () => {
  assert.match(conversationServer, /canonicalSuggestionSucceeded/);
  assert.doesNotMatch(conversationServer, /effectAlreadyPresent/);
});

test("automatic persistence presentation stays separate from canonical suggestion creation", () => {
  assert.match(askRoute, /confirmedCarePersistence\?\.status === "persisted"/);
  assert.match(askRoute, /confirmedCarePersistence.careEntryIds.length > 0/);
  assert.match(askRoute, /persistCanonicalSuggestions/);
  assert.match(askRoute, /resolveAutomaticCareHistoryPresentation/);
  assert.doesNotMatch(askRoute, /const semanticReviewSuggestion/);
});

test("conversation loading reconciles only exact durable canonical receipts", () => {
  assert.match(conversationRoute, /reconcileAskSuggestions/);
  assert.match(conversationServer, /canonicalSuggestionSucceeded/);
  assert.match(conversationServer, /ask_action_capabilities/);
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
  assert.match(migration, /where id=p_suggestion_id and user_id=p_user_id for update/);
  assert.match(suggestionRoute, /SUGGESTION_FORBIDDEN/);
});

test("invalid UI intents return 422 with a stable code", () => {
  assert.match(suggestionRoute, /SUGGESTION_INVALID/);
  assert.match(suggestionRoute, /status: 422/);
  assert.match(migration, /CANONICAL_SUGGESTION_REQUIRED/);
});

test("database failures use stable errors without factual recovery queries", () => {
  assert.match(suggestionRoute, /SUGGESTION_PERSISTENCE_FAILED/);
  assert.match(suggestionRoute, /operationStage/);
  assert.match(suggestionRoute, /safeErrorForLog/);
  assert.doesNotMatch(suggestionRoute, /existingCareEntryId/);
});

test("resolved concerns reopen only through the existing typed transition", () => {
  assert.match(safetyState, /recentlyResolvedConcerns.length > 0/);
  assert.match(canonical, /"care_state.resolve", "care_state.reopen"/);
  assert.match(canonical, /readBoundStateTransitionJob/);
});

test("suggestion continuation cannot delete earlier factual events", () => {
  assert.doesNotMatch(migration, /delete from public.pet_care_entries/);
  assert.match(migration, /public.execute_ask_action_capability/);
});

test("distinct source-bound jobs keep distinct canonical capability identities", () => {
  assert.match(migration, /canonical_capability_id/);
  assert.match(canonical, /sourceMessageId: c.source_message_id/);
  assert.match(continuation, /rebindCanonicalCapabilityAction/);
});

test("conversation copy cannot claim resolution while confirmation is pending", () => {
  assert.match(askRoute, /let governedAnswer = enforceAnswerStateClaims/);
  assert.match(askRoute, /inspectAskPublication/);
  assert.doesNotMatch(askRoute, /reconcileResponsePersistenceCopy/);
});

test("refresh restores automatic and manually saved canonical state", () => {
  assert.match(conversationRoute, /intelligence_source_message_id/);
  assert.match(conversationRoute, /automaticPersistenceByMessage/);
  assert.match(conversationServer, /automaticSaveConfirmation/);
});

test("canonical suggestions deduplicate by capability and legacy prose persistence is retired", () => {
  assert.match(migration, /ai_update_suggestions_canonical_capability_unique/);
  assert.match(migration, /canonical_payload is null/);
  assert.match(read("app/lib/intelligence/persist-pending-suggestion.ts"), /CANONICAL_SUGGESTION_REQUIRED/);
});
