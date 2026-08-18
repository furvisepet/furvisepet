import { revalidatePath } from "next/cache";
import { getAuthenticatedApiContext } from "../../../../lib/authenticated-api-server";
import { executeFurviseApplicationAction, parseStoredApplicationActions } from "../../../../lib/application-actions/index.ts";
import { beginIdempotentRateLimitedOperation } from "../../../../lib/security/idempotency";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../../lib/security/request";
import { emitOperationalEvent } from "../../../../lib/operations/events";

type RouteContext = { params: Promise<{ messageId: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  const { messageId } = await routeContext.params;
  if (!isUuid(messageId)) return Response.json({ error: "That Furvise action is invalid." }, { status: 400 });
  const auth = await getAuthenticatedApiContext(request);
  if ("response" in auth) return auth.response;
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: oversized ? "That action request is too large." : "Send a valid action request." }, { status: oversized ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["actionId", "decision"])) return Response.json({ error: "That action request contains unsupported fields." }, { status: 400 });
  const body = rawBody as { actionId?: unknown; decision?: unknown };
  if (typeof body.actionId !== "string" || (body.decision !== "confirm" && body.decision !== "cancel")) {
    return Response.json({ error: "Choose confirm or cancel for this action." }, { status: 422 });
  }
  const { data: message, error } = await auth.supabase.from("ask_conversation_messages")
    .select("id,response_data,conversation_id,request_id,sequence_number")
    .eq("id", messageId).eq("user_id", auth.userId).eq("role", "furvise")
    .maybeSingle<{ id: string; response_data: Record<string, unknown> | null; conversation_id: string; request_id: string | null; sequence_number: number }>();
  if (error) return Response.json({ error: "That action could not be loaded." }, { status: 503 });
  const actions = parseStoredApplicationActions(message?.response_data?.applicationActions);
  const action = actions.find((candidate) => candidate.id === body.actionId);
  if (!message || !action) return Response.json({ error: "That action is no longer available." }, { status: 404 });
  const { data: sourceMessage } = await auth.supabase.from("ask_conversation_messages").select("id")
    .eq("conversation_id", message.conversation_id).eq("user_id", auth.userId).eq("role", "user")
    .lt("sequence_number", message.sequence_number).order("sequence_number", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (!sourceMessage) return Response.json({ error: "The source request for that action is no longer available." }, { status: 409 });

  const gate = await beginIdempotentRateLimitedOperation({
    operationType: `ask.application_action.${action.kind}`,
    payload: { actionId: action.id, decision: body.decision, messageId },
    policy: action.safetyClass === "DESTRUCTIVE" ? "DESTRUCTIVE_WRITE" : action.mutationClass === "mutation" ? "CARE_WRITE" : "PROFILE_WRITE",
    request,
    retention: action.safetyClass === "DESTRUCTIVE" ? "destructive" : "ordinary",
    route: "/api/ask/actions/[messageId]",
    supabase: auth.supabase,
    userId: auth.userId,
  });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const current = actions.find((candidate) => candidate.id === action.id)!;
    if (current.status === "succeeded" || current.status === "cancelled") return Response.json({ action: current, changed: false });
    const execution = body.decision === "cancel"
      ? { action: { ...current, status: "cancelled" as const, resultMessage: "Action cancelled.", errorMessage: null }, changed: false }
      : await executeFurviseApplicationAction({ action: current, confirmed: true, sourceMessageId: sourceMessage.id, supabase: auth.supabase, userId: auth.userId });
    const audit = "audit" in execution ? execution.audit : { authorization: "allowed", outcome: "cancelled" };
    const nextActions = actions.map((candidate) => candidate.id === action.id ? execution.action : candidate);
    const nextResponse = { ...message.response_data, applicationActions: nextActions };
    const removesSourceMessage = action.kind === "pet.delete_permanently" && execution.action.status === "succeeded";
    const updated = removesSourceMessage ? { data: { id: message.id }, error: null } : await auth.supabase.from("ask_conversation_messages").update({ response_data: nextResponse })
      .eq("id", message.id).eq("user_id", auth.userId).select("id").maybeSingle<{ id: string }>();
    emitOperationalEvent({
      actorId: auth.userId,
      errorCode: execution.action.status === "failed" ? "ASK_ACTION_FAILED" : undefined,
      eventType: execution.action.status === "failed" ? "application_error" : "application_action",
      feature: "ask_application_action",
      metadata: { actionKind: action.kind, authorization: audit.authorization, outcome: audit.outcome },
      operationId: action.id,
      requestId: message.request_id || crypto.randomUUID(),
      resourceId: action.petId,
      route: "/api/ask/actions/[messageId]",
      severity: execution.action.status === "failed" ? "warning" : "info",
    });
    if (execution.changed) revalidateActionViews(action.petId);
    return Response.json({
      action: execution.action,
      changed: execution.changed,
      ...(updated.error || !updated.data ? { persistenceWarning: "The verified action completed, but its conversation receipt could not be saved." } : {}),
    });
  });
}

function revalidateActionViews(petId: string) {
  revalidatePath("/pets");
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/dogs/${petId}/memories`);
  revalidatePath("/care-log");
  revalidatePath("/vet-brief");
}
