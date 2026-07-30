import { parseAskConversationResponse } from "../../../../../lib/ask.mjs";
import { getAskConversationRequestContext, type AskMessageRow } from "../../../../../lib/ask-conversation-server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../../../lib/security/request";

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
  const { data: conversation } = await context.supabase.from("ask_conversations").select("id").eq("id", id).eq("user_id", context.userId).maybeSingle<{ id: string }>();
  if (!conversation) return Response.json({ error: "That conversation is not available." }, { status: 404 });
  const { data: last } = await context.supabase.from("ask_conversation_messages").select("sequence_number").eq("conversation_id", id).eq("user_id", context.userId).order("sequence_number", { ascending: false }).limit(1).maybeSingle<{ sequence_number: number }>();
  const sequence = (last?.sequence_number || 0) + 1;
  const { data: messages, error } = await context.supabase
    .from("ask_conversation_messages")
    .insert([
      { conversation_id: id, role: "user", sequence_number: sequence, user_id: context.userId, user_text: question },
      { context_used: body?.contextUsed || null, conversation_id: id, response_data: response, role: "furvise", save_metadata: body?.saveMetadata || null, sequence_number: sequence + 1, user_id: context.userId },
    ])
    .select("id, role, user_text, response_data, save_metadata, context_used, created_at")
    .order("sequence_number", { ascending: true })
    .returns<AskMessageRow[]>();
  if (error || !messages) return Response.json({ error: "The answer could not be added to history." }, { status: 503 });
  await context.supabase.from("ask_conversations").update({ last_activity_at: new Date().toISOString(), preview: response.directAnswer.slice(0, 220) }).eq("id", id).eq("user_id", context.userId);
  return Response.json({ messages });
}
