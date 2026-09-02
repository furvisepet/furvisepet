import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveConversationTitle } from "../app/lib/ask-conversations.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("conversation titles are concise and human", () => {
  assert.equal(deriveConversationTitle("What should I track before the next vet visit?", "Rocky"), "Preparing for Rocky’s vet visit");
  assert.equal(deriveConversationTitle("Why is Rocky scratching?", "Rocky"), "Tracking Rocky’s scratching");
  assert.ok(deriveConversationTitle("Could changing food help with dinner routines and appetite?", "Rocky").length <= 80);
});

test("Ask exposes separate new-question, history, pet-switch, and thread-open actions", () => {
  const page = read("app/ask/page.tsx");
  assert.match(page, />New question</);
  assert.match(page, />Conversations</);
  assert.match(page, /function switchPet/);
  assert.match(page, /function openConversation/);
  assert.match(page, /Start a new question\?/);
  assert.match(page, /Your current conversation will stay in \$\{petName\}\\u2019s history\./);
  assert.match(page, /Start new question/);
  assert.match(page, /Keep writing/);
  assert.match(page, /if \(question\.trim\(\)\) setPendingNewQuestion\(true\)/);
});

test("Ask persists chronological conversations with owner RLS", () => {
  const migration = read("supabase/migrations/20260724030000_add_ask_conversations.sql");
  const collection = read("app/api/ask/conversations/route.ts");
  const messages = read("app/api/ask/conversations/[id]/messages/route.ts");
  assert.match(migration, /create table if not exists public\.ask_conversations/);
  assert.match(migration, /create table if not exists public\.ask_conversation_messages/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(collection, /deriveConversationTitle/);
  assert.match(messages, /sequence_number: sequence \+ 1/);
});

test("Ask fresh and follow-up states differ and formal print is absent", () => {
  const page = read("app/ask/page.tsx");
  const contract = read("app/lib/ask.mjs");
  assert.match(page, /Not sure where to start\?/);
  assert.match(page, /Try one of these, or say it your own way\./);
  assert.doesNotMatch(page, /Ask about something funny|Nothing is sent until you press Ask/);
  assert.match(page, /Ask or tell Furvise anything about \$\{petName\}\\u2026/);
  assert.match(page, /Ask or tell Furvise more about \$\{petName\}\\u2026/);
  assert.match(page, /Prepare vet brief/);
  assert.doesNotMatch(page, /window\.print|>Print</);
  assert.doesNotMatch(contract, /"print"/);
});

test("missing Ask details have one primary responsive location", () => {
  const page = read("app/ask/page.tsx");
  assert.equal(page.split("Make this more specific").length - 1, 0);
  assert.doesNotMatch(page, /getMissingDetails|missingUsefulDetails\.map/);
  assert.doesNotMatch(page, /Would make this more specific|Useful details to add:/);
});

test("Vet Brief uses outline, grouped empty state, external preview controls, and gated exports", () => {
  const page = read("app/vet-brief/page.tsx");
  const toolbarIndex = page.indexOf('aria-label="Preview controls"');
  const documentIndex = page.indexOf("<VetBriefDocumentView");
  assert.match(page, /Document settings/);
  assert.match(page, /Document outline/);
  assert.match(page, /Information not yet recorded/);
  assert.match(page, /Edit section/);
  assert.ok(toolbarIndex > -1 && toolbarIndex < documentIndex);
  assert.match(page, /confirmed \? <div/);
  assert.match(page, /Download PDF/);
  assert.match(page, />Share</);
  assert.match(page, />Print</);
  assert.match(page, /Create new version/);
  assert.match(page, /Save draft/);
  assert.match(page, /Confirm brief/);
  assert.match(read("app/components/workflow-primitives.tsx"), /WorkflowDocumentStatus|WorkflowDialog/);
});

test("Vet Brief print route hides controls and explains browser headers", () => {
  const printPage = read("app/vet-briefs/[id]/print/page.tsx");
  const css = read("app/globals.css");
  assert.match(printPage, /Headers and footers/);
  assert.match(printPage, /prefer Download PDF/i);
  assert.match(printPage, /print-controls/);
  assert.match(css, /vet-brief-print-route \.print-controls/);
});
