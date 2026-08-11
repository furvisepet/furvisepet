import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { clearAskClientState } from "../app/lib/ask-conversations.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/ask/page.tsx");
const route = read("app/api/ask/route.ts");
const conversationRoute = read("app/api/ask/conversations/[id]/route.ts");
const conversationListRoute = read("app/api/ask/conversations/route.ts");
const migration = read("supabase/migrations/20260727010000_add_ask_request_idempotency.sql");
const signedInHeader = read("app/components/signed-in-header.tsx");
const appHeader = read("app/components/app-header.tsx");

test("Ask blocks empty and duplicate submissions while exposing a visible request state", () => {
  assert.match(page, /const prompt = promptValue\.trim\(\)/);
  assert.match(page, /if \(!prompt \|\| composerUnavailable \|\| askRequestActiveRef\.current\) return/);
  assert.match(page, /askRequestActiveRef\.current = true/);
  assert.match(page, /disabled=\{!canSend\}/);
  assert.match(page, /requestPhase === "submitting"/);
  assert.match(page, /requestPhase === "receiving"/);
  assert.match(page, /Furvise is reviewing \$\{petName\}'s saved details/);
});

test("Ask sends selected pet context and one idempotent request", () => {
  const askFunction = page.slice(page.indexOf("async function ask("), page.indexOf("function saveCurrentDraft"));
  assert.equal((askFunction.match(/idempotentClientFetch\("\/api\/ask"/g) || []).length, 1);
  assert.match(askFunction, /petId: selectedPet/);
  assert.match(askFunction, /requestId/);
  assert.match(askFunction, /signal: AbortSignal\.timeout\(55_000\)/);
  assert.doesNotMatch(askFunction, /\/api\/ask\/conversations\/.*\/messages/);
});

test("failure preserves the visible user message and retry reuses its request ID", () => {
  const askFunction = page.slice(page.indexOf("async function ask("), page.indexOf("function saveCurrentDraft"));
  assert.match(askFunction, /if \(!retry\) setThread/);
  assert.match(askFunction, /requestId = retry\?\.requestId \|\| getOrCreateClientMutationKey/);
  assert.match(askFunction, /requestPayload = retry\?\.payload \|\| buildAskRequestPayload/);
  assert.match(askFunction, /setFailedRequest\(\{ code, payload: requestPayload, requestId, scope, userMessageId \}\)/);
  assert.match(page, /clearClientMutationKey\(failedRequest\.scope, failedRequest\.requestId\)/);
  assert.doesNotMatch(askFunction, /current\.filter\(\(message\) => message\.id !== userMessageId\)/);
  assert.match(page, /FURVISE_ANSWER_UNAVAILABLE_MESSAGE/);
  assert.match(page, />Try again</);
  assert.match(page, />Edit question</);
});

test("provider rate limits release the one reservation and return a stable recoverable error", () => {
  assert.match(route, /safeReleaseAiCredit/);
  assert.match(route, /isProviderRateLimit\(error\)/);
  assert.match(route, /"AI_RATE_LIMITED"/);
  assert.match(route, /Furvise is receiving a lot of questions right now\. Your message is saved, and no AI credit was used\. Try again in a moment\./);
  assert.match(page, /code === "AI_RATE_LIMITED"/);
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

test("a usable answer survives assistant persistence failure", () => {
  assert.match(route, /persist_assistant_message[\s\S]*successfulAnswerResponse\(\{[\s\S]*persistenceWarning: "This answer could not be saved to conversation history\."[\s\S]*saved: false/);
  assert.match(route, /persistence: \{[\s\S]*saved,[\s\S]*warning/);
  assert.match(page, /payload\.persistence\?\.saved === false/);
  assert.match(page, /persistenceWarning \? <Status/);
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
  assert.match(page, /Questions you ask Furvise will appear here/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /onMouseDown=.*onClose/);
});

test("sign out clears user-specific browser state and redirects safely", () => {
  assert.match(signedInHeader, /await client\.auth\.signOut\(\)/);
  assert.match(signedInHeader, /clearNewPetOnboardingState/);
  assert.match(signedInHeader, /clearActivePetId/);
  assert.match(signedInHeader, /clearAskClientState\(window\.localStorage\)/);
  assert.match(signedInHeader, /router\.replace\("\/"\)/);
  assert.match(signedInHeader, /window\.location\.replace\("\/"\)/);
  assert.match(signedInHeader, /Couldn't sign out\. Please try again\./);
  assert.match(signedInHeader, /Signing out/);
  assert.match(appHeader, /accountError/);
  assert.match(signedInHeader, /label: "Privacy"/);
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
