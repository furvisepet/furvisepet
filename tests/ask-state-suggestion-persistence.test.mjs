import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {PATCH,request} from "./helpers/ask-read-only-action-routes.mjs";
import {assertPublicMutationDenied} from "./helpers/ask-public-mutation-boundary.mjs";
async function deniedSuggestion(body) {
 let io=0;globalThis.__readOnlyMutationAuth={userId:"owner",supabase:new Proxy({},{get(){io++;throw Error("retired suggestion must not access private IO");}})};
 const result=await PATCH(request("PATCH",body));assert.equal(result.status,409);assert.equal(result.headers.get("cache-control"),"private, no-store");
 const data=await result.json();assert.equal(data.code,"SUGGESTION_CONFLICT");assert.equal(data.ok,false);assert.equal(io,0);return data;
}
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

test("private canonical suggestions retain governed authority while public continuation is unavailable", async () => {
  await deniedSuggestion({decision:"confirm",canonical_payload:{capabilityId:"claimed",ownerId:"foreign"}});
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

test("private receipts remain exact and public suggestion retries cannot execute", async () => {
  assert.match(migration, /ask_suggestion_receipt_succeeded/);
  await deniedSuggestion({decision:"confirm",status:"already_applied",receipt:{id:"claimed"}});
  await deniedSuggestion({decision:"confirm",status:"already_applied",receipt:{id:"claimed"}});
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

test("public Ask publishes a reply without automatic persistence or suggestion creation", async () => {
  await assertPublicMutationDenied("Save this observation.","I saved this observation.");
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

test("invalid UI intents cannot reactivate public suggestion execution", async () => {
  await deniedSuggestion({decision:"invented",ownerId:"foreign",action:"delete"});
  assert.match(migration, /CANONICAL_SUGGESTION_REQUIRED/);
});

test("disabled suggestions return a stable denial without attempting database recovery", async () => {
  await deniedSuggestion({decision:"confirm",id:"unavailable-database"});
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

test("public conversation cannot claim resolution while confirmation is pending", async () => {
  await assertPublicMutationDenied("Resolve the pending concern.","I completed the pending action.");
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
