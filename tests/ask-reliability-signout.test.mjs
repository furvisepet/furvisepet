import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { clearAskClientState } from "../app/lib/ask-conversations.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/ask/page.tsx");
const route = read("app/api/ask/route.ts");
const errorUx = read("app/lib/ask-errors.ts");
const conversationRoute = read("app/api/ask/conversations/[id]/route.ts");
const conversationListRoute = read("app/api/ask/conversations/route.ts");
const migration = read("supabase/migrations/20260727010000_add_ask_request_idempotency.sql");
const signedInHeader = read("app/components/signed-in-header.tsx");
const accountUtility = read("app/components/account-utility.tsx");
const signOutHelper = read("app/lib/sign-out.ts");
const appHeader = read("app/components/app-header.tsx");

test("Ask blocks empty and duplicate submissions while exposing a visible request state", () => {
  assert.match(page, /const prompt = promptValue\.trim\(\)/);
  assert.match(page, /if \(!prompt \|\| composerUnavailable \|\| askRequestActiveRef\.current\) return/);
  assert.match(page, /askRequestActiveRef\.current = true/);
  assert.match(page, /disabled=\{!canSend\}/);
  assert.match(page, /requestPhase === "submitting"/);
  assert.match(page, /requestPhase === "receiving"/);
  assert.match(page, /Furvise is thinking this through/);
});

test("Ask sends selected pet context and one idempotent request", () => {
  const askFunction = page.slice(page.indexOf("async function ask("), page.indexOf("function saveCurrentDraft"));
  assert.equal((askFunction.match(/idempotentClientFetch\("\/api\/ask"/g) || []).length, 1);
  assert.match(askFunction, /petId: selectedPet/);
  assert.match(askFunction, /logicalTurnId/);
  assert.match(askFunction, /signal: AbortSignal\.timeout\(55_000\)/);
  assert.doesNotMatch(askFunction, /\/api\/ask\/conversations\/.*\/messages/);
});

test("failure preserves the visible user message and retry reuses its logical turn", () => {
  const askFunction = page.slice(page.indexOf("async function ask("), page.indexOf("function saveCurrentDraft"));
  assert.match(askFunction, /if \(!retry\) setThread/);
  assert.match(askFunction, /logicalTurnId = retry\?\.logicalTurnId \|\| crypto\.randomUUID/);
  assert.match(askFunction, /requestPayload = retry\?\.payload \|\| buildAskRequestPayload/);
  assert.match(askFunction, /setFailedRequest\(\{ code: failure\.code, payload: requestPayload, logicalTurnId/);
  assert.match(page, /setQuestion\(failedRequest\.payload\.message\)/);
  assert.doesNotMatch(askFunction, /current\.filter\(\(message\) => message\.id !== userMessageId\)/);
  assert.match(page, /getAskErrorPresentation/);
  assert.match(page, />Try again</);
  assert.match(page, /presentation\.recommendedAction === "edit" \? <button[^>]+onClick=\{onEdit\}/);
});

test("a failed turn cannot lend its request identity or edit state to a new composer submission", () => {
  const askFunction = page.slice(page.indexOf("async function ask("), page.indexOf("function saveCurrentDraft"));
  assert.match(askFunction, /const logicalTurnId = retry\?\.logicalTurnId \|\| crypto\.randomUUID\(\)/);
  const claim = route.indexOf("idempotency = await claimIdempotentOperation");
  const replay = route.indexOf("completed response replayed after canonical identity validation");
  assert.ok(claim >= 0 && replay > claim);
  assert.match(route, /assertPersistedReplayIdentity/);
  assert.match(errorUx, /case "INVALID_CURRENT_INPUT"/);
  assert.doesNotMatch(errorUx, /TEMPORARY_PROVIDER_FAILURE[\s\S]{0,180}"edit"/);
});

test("provider rate limits release the one reservation and return a stable recoverable error", () => {
  assert.match(route, /safeReleaseAiCredit/);
  assert.match(route, /isProviderRateLimit\(error\)/);
  assert.match(route, /"AI_RATE_LIMITED"/);
  assert.match(route, /Furvise is receiving a lot of questions right now\. Your message is saved, and no AI credit was used\. Try again in a moment\./);
  assert.match(errorUx, /"TEMPORARY_PROVIDER_FAILURE"/);
});

test("Recent conversations excludes threads that have no assistant answer", () => {
  assert.match(conversationListRoute, /ask_conversation_messages!inner\(id, role\)/);
  assert.match(conversationListRoute, /\.eq\("ask_conversation_messages\.role", "furvise"\)/);
});

test("conversation cards hide internal usage copy and generic AI headings", () => {
  assert.doesNotMatch(page, /No AI credit used/);
  assert.match(page, /shouldShowAnswerHeading\(response\.title\)/);
  assert.match(page, /shouldShowAnswerHeading/);
});

test("Ask API verifies pet ownership and persists the user message before generating an answer", () => {
  assert.match(route, /\.from\("dog_profiles"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(route, /PET_NOT_FOUND/);
  assert.match(route, /ensureConversationAndUserMessage/);
  assert.match(route, /persistAssistantAnswer/);
  const persistence = route.indexOf("preparedRequest = existingRequest || await ensureConversationAndUserMessage");
  const generation = route.indexOf("await orchestrateAskTurn");
  assert.ok(persistence > -1 && persistence < generation);
  assert.ok(generation < route.lastIndexOf('role: "furvise"'));
  assert.match(route, /userMessageId:/);
  assert.match(route, /assistantMessageId:/);
  assert.match(route, /success: true/);
  assert.match(route, /askRequestTimeoutMs = 50_000/);
});

test("assistant persistence failure releases credit and returns a retryable saved-question error", () => {
  const persistence = route.slice(route.indexOf("async function persistAssistantAnswer"), route.indexOf("async function persistPendingSuggestion"));
  assert.match(persistence, /completeAskConversationTurn\([\s\S]*safeReleaseAiCredit[\s\S]*askFailure\("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503/);
  assert.match(persistence, /persistence_failed[\s\S]*safeReleaseAiCredit[\s\S]*askFailure\("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503/);
  assert.doesNotMatch(persistence.slice(0, persistence.indexOf('logAskStage("assistant message persisted"')), /completeAiCredit/);
});

test("provider diagnostics stay server-side and expose only safe metadata", () => {
  for (const stage of ["authentication succeeded", "pet ownership succeeded", "context loaded", "user message persisted", "turn orchestrated", "assistant message persisted", "final response serialized"]) {
    assert.match(route, new RegExp(stage));
  }
  assert.match(route, /\[Ask provider\] stage/);
  assert.doesNotMatch(page, /Diagnostic:|debugStage|AI_UNAVAILABLE at|ai_provider/);
  assert.doesNotMatch(route, /\.\.\.\(process\.env\.NODE_ENV !== "production" && debugStage/);
  assert.doesNotMatch(route, /authorization headers|OPENAI_API_KEY:/i);
});

test("request IDs are indexed safely on the existing message table", () => {
  assert.match(migration, /alter table public\.ask_conversation_messages/);
  assert.match(migration, /add column if not exists request_id uuid/);
  assert.match(migration, /unique index[\s\S]*\(user_id, request_id, role\)/);
  assert.doesNotMatch(migration, /create table/);
});

test("saved conversations load chronologically and Recent conversations is recoverable", () => {
  assert.match(conversationRoute, /order\("sequence_number", \{ ascending: true \}\)/);
  assert.match(page, /No conversations yet/);
  assert.match(page, /Questions and things you tell Furvise will show up here\./);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /onMouseDown=.*onClose/);
});

test("sign out clears user-specific browser state and redirects safely", () => {
  assert.match(accountUtility, /await signOutOfFurvise\(client\)/);
  assert.match(signOutHelper, /await client\.auth\.signOut\(\)/);
  assert.match(signOutHelper, /clearNewPetOnboardingState/);
  assert.match(signOutHelper, /clearActivePetId/);
  assert.match(signOutHelper, /clearAskClientState\(window\.localStorage\)/);
  assert.match(accountUtility, /window\.location\.replace\("\/"\)/);
  assert.match(accountUtility, /Couldn't sign out\. Please try again\./);
  assert.match(accountUtility, /Signing out/);
  assert.match(appHeader, /<AccountUtility email=\{accountEmail\} \/>/);
  assert.match(accountUtility, /href="\/privacy" label="Privacy"/);
  assert.doesNotMatch(signedInHeader, /signOutOfFurvise|window\.location\.replace/);
});

test("Ask client state clearing removes drafts without touching unrelated keys", () => {
  const values = new Map([
    ["furvise:ask-draft:new:pet", "draft"],
    ["furvise:ask-thread:pet", "thread"],
    ["furvise:unrelated", "keep"],
  ]);
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
  };
  clearAskClientState(storage);
  assert.deepEqual([...values.entries()], [["furvise:unrelated", "keep"]]);
});
