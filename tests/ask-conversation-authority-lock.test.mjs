import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260903100852_restrict_ask_conversation_mutation_authority.sql");
const authority = read("app/lib/ask-conversation-authority.ts");
const askRoute = read("app/api/ask/route.ts");
const conversationsRoute = read("app/api/ask/conversations/route.ts");
const conversationRoute = read("app/api/ask/conversations/[id]/route.ts");
const messagesRoute = read("app/api/ask/conversations/[id]/messages/route.ts");
const readiness = read("app/lib/operations/readiness.ts");

test("authenticated Ask tables are SELECT-only and retain enforced owner RLS", () => {
  for (const table of ["ask_conversations", "ask_conversation_messages"]) {
    assert.match(migration, new RegExp(`revoke all privileges on table public\\.${table} from authenticated`));
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(migration, /revoke update \(care_persistence, response_data\)[\s\S]*from authenticated/);
  assert.match(migration, /ask_conversations_select_own/);
  assert.match(migration, /ask_conversation_messages_select_own/);
  assert.match(migration, /has_column_privilege\('authenticated',[\s\S]*'UPDATE'\)/);
  assert.match(migration, /'TRUNCATE'/);
  assert.match(migration, /'TRIGGER'/);
  assert.match(migration, /'REFERENCES'/);
});

test("Ask mutation RPCs are service-only guarded security definers", () => {
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
    assert.match(migration, new RegExp(`create (?:or replace )?function public\\.${name}\\(`));
    assert.match(migration, new RegExp(`function public\\.${name}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`));
    assert.match(migration, new RegExp(`function public\\.${name}\\([\\s\\S]*?private\\.require_service_role_request\\(\\)`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
  }
  assert.doesNotMatch(migration, /grant execute on function public\.(?:create|append|begin|complete|update|finalize|rename|delete)_ask_[\s\S]*?to authenticated/);
});

test("server authority uses only the canonical secret and exposes bounded operations", () => {
  assert.match(authority, /import "server-only"/);
  assert.match(authority, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(authority, /NEXT_PUBLIC_SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  for (const rpc of [
    "create_ask_conversation_exchange",
    "append_ask_conversation_exchange",
    "begin_ask_conversation_turn",
    "complete_ask_conversation_turn",
    "update_ask_assistant_response",
    "finalize_ask_assistant_response",
    "rename_ask_conversation",
    "delete_ask_conversation",
  ]) assert.match(authority, new RegExp(`callAskConversationAuthority\\("${rpc}"`));
});

test("all current Ask API mutation paths use server authority rather than table writes", () => {
  assert.match(conversationsRoute, /createAskConversationExchange\(/);
  assert.match(messagesRoute, /appendAskConversationExchange\(/);
  assert.match(conversationRoute, /renameAskConversation\(/);
  assert.match(conversationRoute, /deleteAskConversation\(/);
  for (const helper of ["beginAskConversationTurn", "completeAskConversationTurn", "updateAskAssistantResponse", "finalizeAskAssistantResponse"]) {
    assert.match(askRoute, new RegExp(`${helper}\\(`));
  }
  for (const source of [askRoute, conversationsRoute, conversationRoute, messagesRoute]) {
    assert.doesNotMatch(source, /\.from\("ask_conversations"\)[\s\S]{0,500}?\.(?:insert|update|delete)\(/);
    assert.doesNotMatch(source, /\.from\("ask_conversation_messages"\)[\s\S]{0,500}?\.(?:insert|update|delete)\(/);
  }
});

test("create and append are transactional, role-bounded, replay-safe, and sequence-safe", () => {
  assert.match(migration, /'user', 1, p_user_text/);
  assert.match(migration, /'furvise', 2,[\s\S]*p_response_data/);
  assert.match(migration, /v_existing_count <> 2/);
  assert.match(migration, /ASK_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /for update of conversation_row/);
  assert.match(migration, /next_sequence_number = v_sequence \+ 2/);
  assert.match(migration, /v_user_message\.sequence_number \+ 1/);
  assert.doesNotMatch(messagesRoute, /select\("sequence_number"\)/);
});

test("ownership, current pet validity, constrained fields, and readiness fail closed", () => {
  assert.match(migration, /from auth\.users as user_row where user_row\.id = p_user_id/);
  assert.match(migration, /pet_row\.id = p_pet_id and pet_row\.user_id = p_user_id[\s\S]*pet_row\.lifecycle_status <> 'archived'/);
  assert.match(migration, /message_row\.role = 'furvise'/);
  assert.match(migration, /set title = p_title[\s\S]*where conversation_row\.id = p_conversation_id[\s\S]*conversation_row\.user_id = p_user_id/);
  assert.match(migration, /delete from public\.ask_conversations as conversation_row[\s\S]*conversation_row\.user_id = p_user_id/);
  assert.match(migration, /ask_conversation_mutation_authority/);
  assert.match(readiness, /"restrict_ask_conversation_mutation_authority"/);
});
