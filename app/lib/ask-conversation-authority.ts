import "server-only";

import { createClient } from "@supabase/supabase-js";

export type AskConversationAuthorityMessageRow = {
  message_id: string;
  message_request_id: string | null;
  message_role: "user" | "furvise";
  message_user_text: string | null;
  message_response_data: unknown | null;
  message_save_metadata: unknown | null;
  message_context_used: unknown | null;
  message_created_at: string;
  message_sequence_number: number;
};

export type AskConversationCreateAuthorityRow = AskConversationAuthorityMessageRow & {
  conversation_id: string;
  conversation_title: string;
  conversation_preview: string;
  conversation_status: "active" | "archived";
  conversation_last_activity_at: string;
};

function createAskConversationAuthorityClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("ASK_CONVERSATION_AUTHORITY_CONFIGURATION_MISSING");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function callAskConversationAuthority(name: string, parameters: Record<string, unknown>) {
  try {
    const { data, error } = await createAskConversationAuthorityClient().rpc(name, parameters);
    return { data: data as unknown, error: error as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

export function createAskConversationExchange(input: {
  contextUsed: unknown;
  petId: string;
  preview: string;
  requestId: string;
  responseData: unknown;
  saveMetadata: unknown;
  title: string;
  userId: string;
  userText: string;
}) {
  return callAskConversationAuthority("create_ask_conversation_exchange", {
    p_context_used: input.contextUsed,
    p_pet_id: input.petId,
    p_preview: input.preview,
    p_request_id: input.requestId,
    p_response_data: input.responseData,
    p_save_metadata: input.saveMetadata,
    p_title: input.title,
    p_user_id: input.userId,
    p_user_text: input.userText,
  });
}

export function appendAskConversationExchange(input: {
  contextUsed: unknown;
  conversationId: string;
  preview: string;
  requestId: string;
  responseData: unknown;
  saveMetadata: unknown;
  userId: string;
  userText: string;
}) {
  return callAskConversationAuthority("append_ask_conversation_exchange", {
    p_context_used: input.contextUsed,
    p_conversation_id: input.conversationId,
    p_preview: input.preview,
    p_request_id: input.requestId,
    p_response_data: input.responseData,
    p_save_metadata: input.saveMetadata,
    p_user_id: input.userId,
    p_user_text: input.userText,
  });
}

export function beginAskConversationTurn(input: {
  conversationId: string | null;
  petId: string;
  preview: string;
  requestId: string;
  title: string;
  userId: string;
  userText: string;
}) {
  return callAskConversationAuthority("begin_ask_conversation_turn", {
    p_conversation_id: input.conversationId,
    p_pet_id: input.petId,
    p_preview: input.preview,
    p_request_id: input.requestId,
    p_title: input.title,
    p_user_id: input.userId,
    p_user_text: input.userText,
  });
}

export function completeAskConversationTurn(input: {
  contextUsed: unknown;
  conversationId: string;
  intelligenceValidation: unknown;
  persistenceGovernance: unknown;
  preview: string;
  requestId: string;
  responseData: unknown;
  saveMetadata: unknown;
  userId: string;
  userMessageId: string;
}) {
  return callAskConversationAuthority("complete_ask_conversation_turn", {
    p_context_used: input.contextUsed,
    p_conversation_id: input.conversationId,
    p_intelligence_validation: input.intelligenceValidation,
    p_persistence_governance: input.persistenceGovernance,
    p_preview: input.preview,
    p_request_id: input.requestId,
    p_response_data: input.responseData,
    p_save_metadata: input.saveMetadata,
    p_user_id: input.userId,
    p_user_message_id: input.userMessageId,
  });
}

export function updateAskAssistantResponse(input: {
  messageId: string;
  responseData: unknown;
  userId: string;
}) {
  return callAskConversationAuthority("update_ask_assistant_response", {
    p_message_id: input.messageId,
    p_response_data: input.responseData,
    p_user_id: input.userId,
  });
}

export function finalizeAskAssistantResponse(input: {
  carePersistence: unknown;
  messageId: string;
  responseData: unknown;
  userId: string;
}) {
  return callAskConversationAuthority("finalize_ask_assistant_response", {
    p_care_persistence: input.carePersistence,
    p_message_id: input.messageId,
    p_response_data: input.responseData,
    p_user_id: input.userId,
  });
}

export function renameAskConversation(input: { conversationId: string; title: string; userId: string }) {
  return callAskConversationAuthority("rename_ask_conversation", {
    p_conversation_id: input.conversationId,
    p_title: input.title,
    p_user_id: input.userId,
  });
}

export function deleteAskConversation(input: { conversationId: string; userId: string }) {
  return callAskConversationAuthority("delete_ask_conversation", {
    p_conversation_id: input.conversationId,
    p_user_id: input.userId,
  });
}
