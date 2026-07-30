import { parseAskConversationResponse } from "../../../lib/ask.mjs";
import {
  getAskConversationRequestContext,
  toConversationDetail,
  toConversationSummary,
  type AskConversationRow,
  type AskMessageRow,
} from "../../../lib/ask-conversation-server";
import { deriveConversationTitle } from "../../../lib/ask-conversations";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../lib/security/request";
import { beginRateLimitedRequest, getRateLimitRequestId } from "../../../lib/security/rate-limit";

export async function GET(request: Request) {
  const context = await getAskConversationRequestContext(request);
  if ("response" in context) return context.response;
  const petId = new URL(request.url).searchParams.get("pet") || "";
  if (petId && !isUuid(petId)) return Response.json({ error: "That pet identifier is invalid." }, { status: 400 });
  let query = context.supabase
    .from("ask_conversations")
    .select("id, user_id, pet_profile_id, title, preview, status, last_activity_at, dog_profiles(name), ask_conversation_messages!inner(id, role)")
    .eq("user_id", context.userId)
    .eq("ask_conversation_messages.role", "furvise")
    .order("last_activity_at", { ascending: false })
    .limit(40);
  if (petId) query = query.eq("pet_profile_id", petId);
  const { data, error } = await query.returns<AskConversationRow[]>();
  if (error) return Response.json({ error: "Recent conversations are temporarily unavailable." }, { status: 503 });
  return Response.json({ conversations: (data || []).map(toConversationSummary) });
}

export async function POST(request: Request) {
  const context = await getAskConversationRequestContext(request);
  if ("response" in context) return context.response;
  let rawBody: unknown;
  try {
    rawBody = await readBoundedJson(request, API_BODY_LIMITS.conversation);
  } catch (error) {
    return conversationBodyError(error);
  }
  if (!hasOnlyKeys(rawBody, ["petId", "question", "response", "saveMetadata", "contextUsed", "messages"])) {
    return Response.json({ error: "The conversation contains unsupported fields." }, { status: 400 });
  }
  const body = rawBody as {
    petId?: unknown;
    question?: unknown;
    response?: unknown;
    saveMetadata?: unknown;
    contextUsed?: unknown;
    messages?: unknown;
  } | null;
  const petId = typeof body?.petId === "string" ? body.petId : "";
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const response = body?.response ? parseAskConversationResponse(body.response) : null;
  const legacyMessages = parseLegacyMessages(body?.messages);
  if (!isUuid(petId) || question.length > 1200 || (!question && !legacyMessages.length) || (question && !response)) {
    return Response.json({ error: "A complete conversation is required." }, { status: 400 });
  }

  const { data: profile } = await context.supabase
    .from("dog_profiles")
    .select("id, name")
    .eq("id", petId)
    .eq("user_id", context.userId)
    .maybeSingle<{ id: string; name: string | null }>();
  if (!profile) return Response.json({ error: "That pet profile is not available." }, { status: 404 });

  const requestId = getRateLimitRequestId(request);
  const rate = await beginRateLimitedRequest({ payload: { petId, question }, policy: "CONVERSATION_WRITE", request, requestId, route: "/api/ask/conversations", userId: context.userId });
  if (!rate.allowed) return rate.response;

  const messages = question && response
    ? [
        { role: "user" as const, text: question },
        { role: "furvise" as const, response, saveMetadata: body?.saveMetadata || null, contextUsed: body?.contextUsed || null },
      ]
    : legacyMessages;
  const firstQuestion = messages.find((message) => message.role === "user")?.text || question;
  const latestResponse = [...messages].reverse().find((message) => message.role === "furvise");
  const preview = latestResponse?.role === "furvise"
    ? latestResponse.response.directAnswer.slice(0, 220)
    : firstQuestion.slice(0, 220);
  const now = new Date().toISOString();
  const { data: conversation, error: conversationError } = await context.supabase
    .from("ask_conversations")
    .insert({
      last_activity_at: now,
      pet_profile_id: petId,
      preview,
      status: "active",
      title: deriveConversationTitle(firstQuestion, profile.name || "your pet"),
      user_id: context.userId,
    })
    .select("id, user_id, pet_profile_id, title, preview, status, last_activity_at, dog_profiles(name)")
    .single<AskConversationRow>();
  if (conversationError || !conversation) return Response.json({ error: "The conversation could not be saved." }, { status: 503 });

  const rows = messages.map((message, index) => ({
    context_used: message.role === "furvise" ? message.contextUsed : null,
    conversation_id: conversation.id,
    response_data: message.role === "furvise" ? message.response : null,
    role: message.role,
    save_metadata: message.role === "furvise" ? message.saveMetadata : null,
    sequence_number: index + 1,
    user_id: context.userId,
    user_text: message.role === "user" ? message.text : null,
  }));
  const { data: savedMessages, error: messagesError } = await context.supabase
    .from("ask_conversation_messages")
    .insert(rows)
    .select("id, role, user_text, response_data, save_metadata, context_used, created_at")
    .order("sequence_number", { ascending: true })
    .returns<AskMessageRow[]>();
  if (messagesError) {
    await context.supabase.from("ask_conversations").delete().eq("id", conversation.id).eq("user_id", context.userId);
    return Response.json({ error: "The conversation could not be saved." }, { status: 503 });
  }
  return Response.json({ conversation: toConversationDetail(conversation, savedMessages || []) }, { status: 201 });
}

function conversationBodyError(error: unknown) {
  const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
  return Response.json(
    { error: oversized ? "That conversation is too large." : "Send a valid conversation." },
    { status: oversized ? 413 : 400 },
  );
}

type ValidLegacyMessage =
  | { role: "user"; text: string }
  | { role: "furvise"; response: NonNullable<ReturnType<typeof parseAskConversationResponse>>; saveMetadata: unknown | null; contextUsed: unknown | null };

function parseLegacyMessages(value: unknown): ValidLegacyMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ValidLegacyMessage[] = [];
  for (const item of value.slice(-40)) {
    if (!item || typeof item !== "object") continue;
    const draft = item as { role?: unknown; text?: unknown; response?: unknown; saveMetadata?: unknown; contextUsed?: unknown };
    if (draft.role === "user" && typeof draft.text === "string" && draft.text.trim()) {
      messages.push({ role: "user", text: draft.text.trim().slice(0, 1200) });
    } else if (draft.role === "furvise") {
      const response = parseAskConversationResponse(draft.response);
      if (response) messages.push({ role: "furvise", response, saveMetadata: draft.saveMetadata || null, contextUsed: draft.contextUsed || null });
    }
  }
  return messages.some((message) => message.role === "user") && messages.some((message) => message.role === "furvise") ? messages : [];
}
