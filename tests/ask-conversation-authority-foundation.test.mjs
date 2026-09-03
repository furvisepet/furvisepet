import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260903203626_add_ask_conversation_service_authority.sql");
const conversationsRoute = read("app/api/ask/conversations/route.ts");
const conversationRoute = read("app/api/ask/conversations/[id]/route.ts");
const messagesRoute = read("app/api/ask/conversations/[id]/messages/route.ts");

test("Phase A preserves the deployed authenticated write contract", () => {
  assert.doesNotMatch(migration, /revoke all privileges on table public\.ask_conversations from authenticated/);
  assert.doesNotMatch(migration, /revoke all privileges on table public\.ask_conversation_messages from authenticated/);
  assert.doesNotMatch(migration, /revoke update \(care_persistence, response_data\)/);
  assert.doesNotMatch(migration, /drop policy if exists "ask_(?:conversations|conversation_messages)_(?:insert|update|delete)/);
  assert.match(conversationsRoute, /\.from\("ask_conversations"\)[\s\S]*?\.insert\(/);
  assert.match(messagesRoute, /\.from\("ask_conversation_messages"\)[\s\S]*?\.insert\(/);
  assert.match(conversationRoute, /\.from\("ask_conversations"\)\.update\(/);
  assert.match(conversationRoute, /\.from\("ask_conversations"\)\.delete\(/);
});
test("Phase A synchronizes sequence reservations across old and new writers", () => {
  assert.match(migration, /add column if not exists next_sequence_number integer/);
  assert.match(migration, /message_row\.role = 'user'[\s\S]*paired_message\.role = 'furvise'/);
  assert.match(migration, /create trigger ask_conversation_messages_sync_next_sequence/);
  assert.match(migration, /new\.sequence_number \+ case when new\.role = 'user' then 2 else 1 end/);
  assert.match(migration, /for update of conversation_row/);
  assert.match(migration, /select greatest\([\s\S]*into v_sequence[\s\S]*from public\.ask_conversation_messages/);
  assert.match(migration, /next_sequence_number = v_sequence \+ 2/);
});

test("Phase A exposes only bounded service-authority RPCs", () => {
  const functions = [
    "create_ask_conversation_exchange",
    "append_ask_conversation_exchange",
    "begin_ask_conversation_turn",
    "complete_ask_conversation_turn",
    "update_ask_assistant_response",
    "finalize_ask_assistant_response",
    "rename_ask_conversation",
    "delete_ask_conversation",
  ];
  for (const name of functions) {
    assert.match(migration, new RegExp(`function public\\.${name}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`));
    assert.match(migration, new RegExp(`function public\\.${name}\\([\\s\\S]*?private\\.require_service_role_request\\(\\)`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
  }
  assert.doesNotMatch(migration, /grant execute on function public\.[\s\S]*?to (?:anon|authenticated)/);
});
