import { revalidatePath } from "next/cache";
import { getAuthenticatedApiContext } from "../../../../lib/authenticated-api-server";
import { executeFurviseApplicationAction, getFurviseActionPolicy, parseStoredApplicationActions, type FurviseApplicationAction } from "../../../../lib/application-actions/index.ts";
import { classifyCurrentPetLoss, resolveProviderIndependentLossSubject, type LossSubjectPet } from "../../../../lib/ai/pet-loss.ts";
import { isExplicitLifecycleCorrection, reportsDeath } from "../../../../lib/ai/pending-lifecycle.ts";
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
  const sourceQuery = auth.supabase.from("ask_conversation_messages").select("id,user_text,request_id,sequence_number")
    .eq("conversation_id", message.conversation_id).eq("user_id", auth.userId).eq("role", "user");
  const { data: sourceMessage } = action.sourceMessageId
    ? await sourceQuery.eq("id", action.sourceMessageId).maybeSingle<LifecycleSourceMessage>()
    : await sourceQuery.lt("sequence_number", message.sequence_number).order("sequence_number", { ascending: false }).limit(1).maybeSingle<LifecycleSourceMessage>();
  if (!sourceMessage) return Response.json({ error: "The source request for that action is no longer available." }, { status: 409 });
  const existingTerminal = await findTerminalActionStateAcrossConversation({
    actionId: action.id,
    conversationId: message.conversation_id,
    supabase: auth.supabase,
    userId: auth.userId,
  });
  if (existingTerminal.error) return Response.json({ error: "That action's current state could not be verified." }, { status: 503 });
  if (existingTerminal.action) return Response.json({ action: existingTerminal.action, changed: false });
  if (isLifecycleMutation(action)) {
    const { data: conversation } = await auth.supabase.from("ask_conversations").select("pet_profile_id")
      .eq("id", message.conversation_id).eq("user_id", auth.userId).maybeSingle<{ pet_profile_id: string }>();
    const ownedPets = await auth.supabase.from("dog_profiles").select("id,name,species,lifecycle_status")
      .eq("user_id", auth.userId).returns<LossSubjectPet[]>();
    if (ownedPets.error) return Response.json({ error: "That lifecycle action's subject could not be verified." }, { status: 503 });
    if (!conversation || !isAuthoritativeLifecycleAction({
      action,
      conversationPetId: conversation.pet_profile_id,
      ownedPets: ownedPets.data || [],
      sourceMessage,
    })) {
      return Response.json({ error: "That lifecycle action no longer matches its original request." }, { status: 409 });
    }
    if (action.kind === "pet.mark_deceased") {
      const superseded = await hasLaterDeathCorrection({
        conversationId: message.conversation_id,
        sourceSequence: sourceMessage.sequence_number,
        supabase: auth.supabase,
        userId: auth.userId,
      });
      if (superseded.error) return Response.json({ error: "That lifecycle action's current state could not be verified." }, { status: 503 });
      if (superseded.value) return Response.json({ error: "That reported loss was corrected later in this conversation." }, { status: 409 });
    }
  }

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
    const terminal = await findTerminalActionStateAcrossConversation({
      actionId: current.id,
      conversationId: message.conversation_id,
      supabase: auth.supabase,
      userId: auth.userId,
    });
    if (terminal.error) return Response.json({ error: "That action's current state could not be verified." }, { status: 503 });
    if (terminal.action) return Response.json({ action: terminal.action, changed: false });
    const execution = body.decision === "cancel"
      ? { action: { ...current, status: "cancelled" as const, resultMessage: "Action cancelled.", errorMessage: null }, changed: false }
      : await executeFurviseApplicationAction({ action: current, confirmed: true, sourceMessageId: sourceMessage.id, supabase: auth.supabase, userId: auth.userId });
    const audit = "audit" in execution ? execution.audit : { authorization: "allowed", outcome: "cancelled" };
    const removesSourceMessage = action.kind === "pet.delete_permanently" && execution.action.status === "succeeded";
    const receiptPersisted = removesSourceMessage || await persistActionStateAcrossConversation({
      action: execution.action,
      conversationId: message.conversation_id,
      supabase: auth.supabase,
      userId: auth.userId,
    });
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
      ...(!receiptPersisted ? { persistenceWarning: "The verified action completed, but its conversation receipt could not be saved." } : {}),
    });
  });
}

function isLifecycleMutation(action: FurviseApplicationAction) {
  return action.kind === "pet.mark_deceased" || action.kind === "pet.mark_active" || action.kind === "pet.archive";
}

type LifecycleSourceMessage = { id: string; user_text: string | null; request_id: string | null; sequence_number: number };

function isAuthoritativeLifecycleAction(input: {
  action: FurviseApplicationAction;
  conversationPetId: string;
  ownedPets: LossSubjectPet[];
  sourceMessage: LifecycleSourceMessage;
}) {
  const { action, sourceMessage } = input;
  if (action.sourceMessageId && action.sourceMessageId !== sourceMessage.id) return false;
  const policy = getFurviseActionPolicy(action.kind);
  if (action.safetyClass !== policy.safetyClass || action.mutationClass !== policy.mutationClass
    || action.confirmationPolicy !== policy.confirmationPolicy || action.authorizationScope !== policy.authorizationScope) return false;
  if (!sourceMessage.request_id || !action.id.startsWith(`${sourceMessage.request_id}:`)) return false;
  const actionIndex = Number(action.id.slice(sourceMessage.request_id.length + 1));
  if (!Number.isInteger(actionIndex) || actionIndex < 1 || actionIndex > 3) return false;
  const sourceText = sourceMessage.user_text || "";
  if (!sourceText || !normalizeEvidence(sourceText).includes(normalizeEvidence(action.evidence))) return false;
  if (action.kind === "pet.mark_deceased") {
    const target = input.ownedPets.find((pet) => pet.id === action.petId);
    const subject = resolveProviderIndependentLossSubject({
      message: sourceText,
      pets: input.ownedPets,
      selectedPetId: input.conversationPetId,
    });
    const expectedTarget = action.petId === input.conversationPetId ? "selected" : "specified";
    return actionIndex === 1
      && classifyCurrentPetLoss(sourceText) === "confirmed_current"
      && subject?.kind === "resolved"
      && subject.petId === action.petId
      && (target?.lifecycle_status || "active") === "active"
      && action.input.target === expectedTarget;
  }
  if (action.petId !== input.conversationPetId) return false;
  const target = input.ownedPets.find((pet) => pet.id === action.petId);
  if (!target) return false;
  if (action.kind === "pet.archive") {
    return (target.lifecycle_status || "active") === "active"
      && action.explicitIntent && /\barchiv(?:e|ed|ing)?\b/i.test(sourceText);
  }
  return (target.lifecycle_status === "deceased" || target.lifecycle_status === "archived")
    && action.explicitIntent && /\b(?:active|alive|reactivat|correct)\w*\b/i.test(sourceText);
}

async function hasLaterDeathCorrection(input: {
  conversationId: string;
  sourceSequence: number;
  supabase: Parameters<typeof executeFurviseApplicationAction>[0]["supabase"];
  userId: string;
}) {
  const { data, error } = await input.supabase.from("ask_conversation_messages").select("user_text")
    .eq("conversation_id", input.conversationId).eq("user_id", input.userId).eq("role", "user")
    .gt("sequence_number", input.sourceSequence).returns<Array<{ user_text: string | null }>>();
  if (error) return { value: false, error: true };
  const value = (data || []).some((message) => {
    const text = message.user_text || "";
    return isExplicitLifecycleCorrection(text, "reported_deceased") || /\bi meant\b/i.test(text) && reportsDeath(text);
  });
  return { value, error: false };
}

function normalizeEvidence(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function findTerminalActionStateAcrossConversation(input: {
  actionId: string;
  conversationId: string;
  supabase: Parameters<typeof executeFurviseApplicationAction>[0]["supabase"];
  userId: string;
}) {
  const { data, error } = await input.supabase.from("ask_conversation_messages").select("response_data")
    .eq("conversation_id", input.conversationId).eq("user_id", input.userId).eq("role", "furvise")
    .returns<Array<{ response_data: Record<string, unknown> | null }>>();
  if (error) return { action: null, error: true };
  const matches = (data || []).flatMap((message) => parseStoredApplicationActions(message.response_data?.applicationActions))
    .filter((candidate) => candidate.id === input.actionId);
  return {
    action: matches.find((candidate) => candidate.status === "succeeded")
      || matches.find((candidate) => candidate.status === "cancelled")
      || null,
    error: false,
  };
}

async function persistActionStateAcrossConversation(input: {
  action: ReturnType<typeof parseStoredApplicationActions>[number];
  conversationId: string;
  supabase: Parameters<typeof executeFurviseApplicationAction>[0]["supabase"];
  userId: string;
}) {
  const { data, error } = await input.supabase.from("ask_conversation_messages").select("id,response_data")
    .eq("conversation_id", input.conversationId).eq("user_id", input.userId).eq("role", "furvise")
    .returns<Array<{ id: string; response_data: Record<string, unknown> | null }>>();
  if (error) return false;
  const receipts = (data || []).flatMap((message) => {
    const actions = parseStoredApplicationActions(message.response_data?.applicationActions);
    return actions.some((candidate) => candidate.id === input.action.id) ? [{ message, actions }] : [];
  });
  if (!receipts.length) return false;
  for (const receipt of receipts) {
    const applicationActions = receipt.actions.map((candidate) => candidate.id === input.action.id ? input.action : candidate);
    const updated = await input.supabase.from("ask_conversation_messages").update({
      response_data: { ...receipt.message.response_data, applicationActions },
    }).eq("id", receipt.message.id).eq("user_id", input.userId).select("id").maybeSingle<{ id: string }>();
    if (updated.error || !updated.data) return false;
  }
  return true;
}

function revalidateActionViews(petId: string) {
  revalidatePath("/pets");
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/dogs/${petId}/memories`);
  revalidatePath("/care-log");
  revalidatePath("/vet-brief");
}
