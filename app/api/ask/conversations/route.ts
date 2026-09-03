import { parseAskConversationResponse } from "../../../lib/ask.mjs";
import {
  getAskConversationRequestContext,
  toConversationDetail,
  toConversationSummary,
  type AskConversationRow,
  type AskMessageRow,
} from "../../../lib/ask-conversation-server";
import { deriveConversationTitle } from "../../../lib/ask-conversations";
import {
  createAskConversationExchange,
  type AskConversationCreateAuthorityRow,
} from "../../../lib/ask-conversation-authority";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../lib/security/request";
import { beginIdempotentRateLimitedOperation } from "../../../lib/security/idempotency";

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
    .select("id, name, lifecycle_status")
    .eq("id", petId)
    .eq("user_id", context.userId)
    .neq("lifecycle_status", "archived")
    .maybeSingle<{ id: string; name: string | null; lifecycle_status: string }>();
  if (!profile) return Response.json({ error: "That pet profile is not available." }, { status: 404 });

  const gate = await beginIdempotentRateLimitedOperation({ operationType: "conversation.create", payload: { legacyMessages, petId, question, response }, policy: "CONVERSATION_WRITE", request, route: "/api/ask/conversations", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;

  return gate.operation.execute(async () => {
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
  const userMessage = messages.find((message) => message.role === "user");
  const furviseMessage = messages.find((message) => message.role === "furvise");
  if (messages.length !== 2 || !userMessage || userMessage.role !== "user" || !furviseMessage || furviseMessage.role !== "furvise") {
    return Response.json({ error: "The conversation could not be saved." }, { status: 503 });
  }
  const title = deriveConversationTitle(firstQuestion, profile.name || "your pet");
  const { data, error } = await createAskConversationExchange({
    contextUsed: furviseMessage.contextUsed,
    petId,
    preview,
    requestId: gate.operation.key,
    responseData: furviseMessage.response,
    saveMetadata: furviseMessage.saveMetadata,
    title,
    userId: context.userId,
    userText: userMessage.text,
  });
  const rows = validCreateAuthorityRows(data);
  if (error || rows.length !== 2) return Response.json({ error: "The conversation could not be saved." }, { status: 503 });
  const first = rows[0];
  const conversation: AskConversationRow = {
    id: first.conversation_id,
    user_id: context.userId,
    pet_profile_id: petId,
    title: first.conversation_title,
    preview: first.conversation_preview,
    status: first.conversation_status,
    last_activity_at: first.conversation_last_activity_at,
    dog_profiles: { name: profile.name },
  };
  const savedMessages: AskMessageRow[] = rows.map((row) => ({
    id: row.message_id,
    role: row.message_role,
    user_text: row.message_user_text,
    response_data: row.message_response_data,
    save_metadata: row.message_save_metadata,
    context_used: row.message_context_used,
    created_at: row.message_created_at,
  }));
    return Response.json({ conversation: toConversationDetail(conversation, savedMessages || []) }, { status: 201 });
  });
}

function validCreateAuthorityRows(value: unknown): AskConversationCreateAuthorityRow[] {
  if (!Array.isArray(value)) return [];
  const rows = value.filter((row): row is AskConversationCreateAuthorityRow => Boolean(
    row && typeof row === "object"
    && typeof row.conversation_id === "string"
    && typeof row.conversation_title === "string"
    && typeof row.conversation_preview === "string"
    && (row.conversation_status === "active" || row.conversation_status === "archived")
    && typeof row.conversation_last_activity_at === "string"
    && typeof row.message_id === "string"
    && (row.message_role === "user" || row.message_role === "furvise")
    && typeof row.message_created_at === "string"
    && Number.isInteger(row.message_sequence_number)
  ));
  if (rows.length !== 2 || rows[0].message_role !== "user" || rows[0].message_sequence_number !== 1
    || rows[1].message_role !== "furvise" || rows[1].message_sequence_number !== 2
    || rows[0].conversation_id !== rows[1].conversation_id) return [];
  return rows;
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
