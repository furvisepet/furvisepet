import { getAskConversationRequestContext, reconcileAskSuggestions, toConversationDetail, type AskConversationRow, type AskMessageRow, type AskSuggestionRow } from "../../../../lib/ask-conversation-server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../../lib/security/request";
import { beginRateLimitedRequest, getRateLimitRequestId } from "../../../../lib/security/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAskConversationRequestContext(request);
  if ("response" in context) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "That conversation identifier is invalid." }, { status: 400 });
  const { data: conversation } = await context.supabase
    .from("ask_conversations")
    .select("id, user_id, pet_profile_id, title, preview, status, last_activity_at, dog_profiles(name)")
    .eq("id", id)
    .eq("user_id", context.userId)
    .maybeSingle<AskConversationRow>();
  if (!conversation) return Response.json({ error: "That conversation is not available." }, { status: 404 });
  const { data: messages, error } = await context.supabase
    .from("ask_conversation_messages")
    .select("id, request_id, role, user_text, response_data, save_metadata, context_used, care_persistence, created_at")
    .eq("conversation_id", id)
    .eq("user_id", context.userId)
    .order("sequence_number", { ascending: true })
    .returns<AskMessageRow[]>();
  if (error) return Response.json({ error: "That conversation could not be opened." }, { status: 503 });
  const { data: suggestions } = await context.supabase
    .from("ai_update_suggestions")
    .select("id, source_message_id, concern_id, care_entry_id, applied_at, type, title, details, status")
    .eq("conversation_id", id)
    .eq("user_id", context.userId)
    .order("created_at", { ascending: true })
    .returns<AskSuggestionRow[]>();
  const canonicalSuggestions = await reconcileAskSuggestions(context.supabase, context.userId, suggestions || []);
  const userMessageIds = (messages || []).filter((message) => message.role === "user").map((message) => message.id);
  const { data: automaticallyPersistedEntries } = userMessageIds.length
    ? await context.supabase.from("pet_care_entries").select("id, concern_id, intelligence_source_message_id").eq("user_id", context.userId).in("intelligence_source_message_id", userMessageIds)
    : { data: [] };
  const requestByUserMessage = new Map((messages || []).filter((message) => message.role === "user").map((message) => [message.id, message.request_id]));
  const assistantByRequest = new Map((messages || []).filter((message) => message.role === "furvise" && message.request_id).map((message) => [message.request_id, message.id]));
  const automaticPersistenceByMessage = new Map<string, { status: "persisted"; careEntryIds: string[]; concernIds: string[]; errorCode: null }>();
  for (const entry of automaticallyPersistedEntries || []) {
    const requestId = entry.intelligence_source_message_id ? requestByUserMessage.get(entry.intelligence_source_message_id) : null;
    const assistantId = requestId ? assistantByRequest.get(requestId) : null;
    if (!assistantId) continue;
    const existing = automaticPersistenceByMessage.get(assistantId) || { status: "persisted" as const, careEntryIds: [], concernIds: [], errorCode: null };
    existing.careEntryIds.push(entry.id);
    if (entry.concern_id && !existing.concernIds.includes(entry.concern_id)) existing.concernIds.push(entry.concern_id);
    automaticPersistenceByMessage.set(assistantId, existing);
  }
  return Response.json({ conversation: toConversationDetail(conversation, messages || [], canonicalSuggestions, automaticPersistenceByMessage) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAskConversationRequestContext(request);
  if ("response" in context) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "That conversation identifier is invalid." }, { status: 400 });
  let rawBody: unknown;
  try {
    rawBody = await readBoundedJson(request, API_BODY_LIMITS.standard);
  } catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: oversized ? "That title update is too large." : "Send a valid title update." }, { status: oversized ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["title"])) return Response.json({ error: "The title update contains unsupported fields." }, { status: 400 });
  const body = rawBody as { title?: unknown };
  const title = typeof body?.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
  if (!title || title.length > 80) return Response.json({ error: "Use a title between 1 and 80 characters." }, { status: 400 });
  const { data: ownedConversation } = await context.supabase.from("ask_conversations").select("id").eq("id", id).eq("user_id", context.userId).maybeSingle<{ id: string }>();
  if (!ownedConversation) return Response.json({ error: "That conversation could not be renamed." }, { status: 404 });
  const requestId = getRateLimitRequestId(request);
  const rate = await beginRateLimitedRequest({ payload: { conversationId: id, title }, policy: "CONVERSATION_WRITE", request, requestId, route: "/api/ask/conversations/[id]", userId: context.userId });
  if (!rate.allowed) return rate.response;
  const { data, error } = await context.supabase
    .from("ask_conversations")
    .update({ title })
    .eq("id", id)
    .eq("user_id", context.userId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !data) return Response.json({ error: "That conversation could not be renamed." }, { status: 404 });
  return Response.json({ title });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAskConversationRequestContext(request);
  if ("response" in context) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "That conversation identifier is invalid." }, { status: 400 });
  const { data: ownedConversation } = await context.supabase.from("ask_conversations").select("id").eq("id", id).eq("user_id", context.userId).maybeSingle<{ id: string }>();
  if (!ownedConversation) return Response.json({ error: "That conversation could not be deleted." }, { status: 404 });
  const requestId = getRateLimitRequestId(request);
  const rate = await beginRateLimitedRequest({ payload: { conversationId: id }, policy: "CONVERSATION_WRITE", request, requestId, route: "/api/ask/conversations/[id]", userId: context.userId });
  if (!rate.allowed) return rate.response;
  const { error } = await context.supabase.from("ask_conversations").delete().eq("id", id).eq("user_id", context.userId);
  if (error) return Response.json({ error: "That conversation could not be deleted." }, { status: 503 });
  return new Response(null, { status: 204 });
}
