import { parseAskConversationResponse } from "../../../../../lib/ask.mjs";
import { getAskConversationRequestContext, type AskMessageRow } from "../../../../../lib/ask-conversation-server";
import { appendAskConversationExchange, type AskConversationAuthorityMessageRow } from "../../../../../lib/ask-conversation-authority";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../../../lib/security/request";
import { beginIdempotentRateLimitedOperation } from "../../../../../lib/security/idempotency";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAskConversationRequestContext(request);
  if ("response" in context) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "That conversation identifier is invalid." }, { status: 400 });
  let rawBody: unknown;
  try {
    rawBody = await readBoundedJson(request, API_BODY_LIMITS.conversation);
  } catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: oversized ? "That conversation exchange is too large." : "Send a valid conversation exchange." }, { status: oversized ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["question", "response", "saveMetadata", "contextUsed"])) {
    return Response.json({ error: "The conversation exchange contains unsupported fields." }, { status: 400 });
  }
  const body = rawBody as { question?: unknown; response?: unknown; saveMetadata?: unknown; contextUsed?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const response = parseAskConversationResponse(body?.response);
  if (!question || question.length > 1200 || !response) return Response.json({ error: "A complete exchange is required." }, { status: 400 });
  const { data: conversation } = await context.supabase.from("ask_conversations")
    .select("id, dog_profiles!inner(lifecycle_status)")
    .eq("id", id)
    .eq("user_id", context.userId)
    .neq("dog_profiles.lifecycle_status", "archived")
    .maybeSingle<{ id: string }>();
  if (!conversation) return Response.json({ error: "That conversation is not available." }, { status: 404 });
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "conversation.exchange.create", payload: { contextUsed: body.contextUsed, conversationId: id, question, response, saveMetadata: body.saveMetadata }, policy: "CONVERSATION_WRITE", request, route: "/api/ask/conversations/[id]/messages", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { data, error } = await appendAskConversationExchange({
      contextUsed: body?.contextUsed || null,
      conversationId: id,
      preview: response.directAnswer.slice(0, 220),
      requestId: gate.operation.key,
      responseData: response,
      saveMetadata: body?.saveMetadata || null,
      userId: context.userId,
      userText: question,
    });
    const rows = validAuthorityRows(data);
    if (error || rows.length !== 2) return Response.json({ error: "The answer could not be added to history." }, { status: 503 });
    const messages: AskMessageRow[] = rows.map((row) => ({
      id: row.message_id,
      role: row.message_role,
      user_text: row.message_user_text,
      response_data: row.message_response_data,
      save_metadata: row.message_save_metadata,
      context_used: row.message_context_used,
      created_at: row.message_created_at,
    }));
    return Response.json({ messages });
  });
}

function validAuthorityRows(value: unknown): AskConversationAuthorityMessageRow[] {
  if (!Array.isArray(value)) return [];
  const rows = value.filter((row): row is AskConversationAuthorityMessageRow => Boolean(
    row && typeof row === "object"
    && typeof row.message_id === "string"
    && (row.message_role === "user" || row.message_role === "furvise")
    && typeof row.message_created_at === "string"
    && Number.isInteger(row.message_sequence_number)
  ));
  if (rows.length !== 2 || rows[0].message_role !== "user" || rows[1].message_role !== "furvise"
    || rows[1].message_sequence_number !== rows[0].message_sequence_number + 1) return [];
  return rows;
}
