import { isDeepStrictEqual } from "node:util";
import { persistCanonicalSuggestions } from "./canonical-suggestion-continuation.ts";
import { createCanonicalCareAuthorityClient } from "./care-authority-client.ts";
import { deriveAskTaskOutcome, type AskTurnLifecycle } from "../ai/ask-turn-model.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurviseLiveContext } from "./types.ts";
import type { AskInterpretation } from "./interpret-ask.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";
import { getFurviseActionPolicy, shouldAutoExecuteAction } from "../application-actions/policy.ts";
import { createActionCapabilities, executeActionCapability } from "../application-actions/capabilities.ts";
import { completeAskConversationTurn, updateAskAssistantResponse } from "../ask-conversation-authority.ts";
import { buildAskConversationResponse } from "../ask.mjs";
import { buildFurvisePlanningContext } from "./planning-context.ts";
import { retrieveAskHistory } from "./history-retrieval.ts";
import { createAskEvidenceContract } from "./ask-evidence.ts";
import { generateContextAwareAskResponse } from "../ai/ask-reasoning.ts";
import { reviewHistoricalAnswer } from "./review-history-narrative.ts";
import { bindTypedReadTicket } from "../furvise-brain/typed-read-ticket.ts";
import { appendJobProposal, validateAppendJob } from "../furvise-brain/append-job.ts";
import { resolveAskHistoryAccess } from "./history-access.ts";
import { emptyProposedSemanticFrame } from "./semantic-frame/extract-frame.ts";

/** Persist proposals only. No care write, fact read, or auto-execution here. */
export async function prepareAppendTurn(input: {
  context: FurviseLiveContext; interpretation: AskInterpretation; requestId: string; userMessageId: string;
  conversationId: string; supabase: SupabaseClient; usage: unknown; turnLifecycle: AskTurnLifecycle;
}) {
  const job = input.interpretation.request?.appendJob;
  if (!job || job.sourceMessageId !== input.userMessageId) throw Error("APPEND_SOURCE_MISMATCH");
  const pet = input.context.eligiblePets.find(pet => pet.id === job.petId && pet.user_id === input.context.owner.userId);
  if (!pet) throw Error("APPEND_SUBJECT_UNAVAILABLE");
  const proposal: FurviseApplicationAction = { ...getFurviseActionPolicy("care_history.add"),
    id: `${input.requestId}:append`, kind: "care_history.add", petId: pet.id, sourceMessageId: job.sourceMessageId,
    appendJob: job, input: { field: null, value: null, title: "Owner note",
      detail: null, category: "general", target: "specified" },
    evidence: job.items[0].body.text.slice(0, 240), explicitIntent: true, status: "proposed",
    label: job.items.length === 1 ? "Add to care history" : `Add ${job.items.length} records to care history`,
    description: job.items.map(item => item.body.text).join("\n\n").slice(0, 600),
    href: null, resultMessage: null, errorMessage: null };
  const response = buildAskConversationResponse({ title: proposal.label, summary: proposal.description, sections: [], safetyNote: null },
    { intent: "new_observation", missingUsefulDetails: [], usedContextSummary: [] });
  if (!response) throw Error("APPEND_PRESENTATION_INVALID");
  const pendingAppend = { version: 1, sourceMessageId: job.sourceMessageId, conversationId: input.conversationId,
    selectedPetId: input.context.pet.id, locale: input.context.locale, timeZone: input.context.timeZone,
    job, readTicket: input.interpretation.request?.readTicket || null,
    readRequest: input.interpretation.request?.readTicket ? { ...input.interpretation.request, mode: "read", appendJob: null, jobs: [input.interpretation.request.readTicket] } : null };
  input.turnLifecycle.route("application_action", "ai").subject("typed_append", 1).actions(1)
    .outcomes("not_assessed", "pending", true).transition("ANSWER_VALIDATED");
  const canonical = { ...response, applicationActions: [proposal], pendingAppend, turn: input.turnLifecycle.snapshot() };
  const completed = await completeAskConversationTurn({ conversationId: input.conversationId, userMessageId: input.userMessageId,
    requestId: input.requestId, userId: input.context.owner.userId, preview: response.directAnswer.slice(0, 220), responseData: canonical,
    contextUsed: { petName: pet.name, usedSources: [] }, saveMetadata: null, intelligenceValidation: null, persistenceGovernance: null });
  const id = Array.isArray(completed.data) && completed.data.length === 1 ? completed.data[0]?.assistant_message_id : null;
  if (completed.error || typeof id !== "string") throw Error("APPEND_PROPOSAL_PERSISTENCE_FAILED");
  const actions = await createActionCapabilities({ actions: [proposal], assistantMessageId: id, sourceMessageId: job.sourceMessageId,
    supabase: input.supabase, userId: input.context.owner.userId });
  if (actions.length !== 1 || !/^[0-9a-f-]{36}$/i.test(actions[0].id) || actions[0].status === "failed") throw Error("APPEND_CAPABILITY_UNAVAILABLE");
  await persistCanonicalSuggestions({ authority: createCanonicalCareAuthorityClient(), userId: input.context.owner.userId, actions });
  input.turnLifecycle.transition("ANSWER_PERSISTED");
  let stored = { ...canonical, applicationActions: actions, turn: input.turnLifecycle.snapshot() };
  let updated = await updateAskAssistantResponse({ messageId: id, userId: input.context.owner.userId, responseData: stored });
  if (updated.error || updated.data !== true) throw Error("APPEND_CAPABILITY_PRESENTATION_FAILED");

  let dataChanged = false;
  let persistenceMode = "confirmation_required";
  const executable = actions[0];
  if (shouldAutoExecuteAction(executable)) {
    const execution = await executeActionCapability({
      capabilityId: executable.id,
      assistantMessageId: id,
      userId: input.context.owner.userId,
      mode: "auto",
    });
    if (!execution) throw Error("APPEND_AUTO_EXECUTION_UNAVAILABLE");
    dataChanged = execution.changed;
    persistenceMode = "auto_executed";
    if (execution.action.status === "succeeded") {
      const continuation = await continueConfirmedAppend({
        supabase: input.supabase,
        userId: input.context.owner.userId,
        assistantMessageId: id,
        action: execution.action,
      });
      if (continuation?.response) {
        stored = continuation.response;
      } else {
        const result = buildAskConversationResponse({
          title: "Furvise",
          summary: execution.action.resultMessage || "The update was added to care history.",
          sections: [],
          safetyNote: null,
        }, { intent: "new_observation", missingUsefulDetails: [], usedContextSummary: [] });
        if (!result) throw Error("APPEND_RESULT_PRESENTATION_INVALID");
        input.turnLifecycle.outcomes("complete", "applied", false).transition("COMPLETED");
        stored = { ...canonical, ...result, applicationActions: [execution.action], turn: input.turnLifecycle.snapshot() };
        updated = await updateAskAssistantResponse({ messageId: id, userId: input.context.owner.userId, responseData: stored });
        if (updated.error || updated.data !== true) throw Error("APPEND_RESULT_PRESENTATION_FAILED");
      }
    } else {
      const result = buildAskConversationResponse({
        title: "Furvise",
        summary: execution.action.errorMessage || "That update could not be added to care history.",
        sections: [],
        safetyNote: null,
      }, { intent: "new_observation", missingUsefulDetails: [], usedContextSummary: [] });
      if (!result) throw Error("APPEND_RESULT_PRESENTATION_INVALID");
      input.turnLifecycle.outcomes("limited", "failed", false).transition("COMPLETED");
      stored = { ...canonical, ...result, applicationActions: [execution.action], turn: input.turnLifecycle.snapshot() };
      updated = await updateAskAssistantResponse({ messageId: id, userId: input.context.owner.userId, responseData: stored });
      if (updated.error || updated.data !== true) throw Error("APPEND_RESULT_PRESENTATION_FAILED");
    }
  } else {
    input.turnLifecycle.transition("COMPLETED");
    stored = { ...stored, turn: input.turnLifecycle.snapshot() };
    updated = await updateAskAssistantResponse({ messageId: id, userId: input.context.owner.userId, responseData: stored });
    if (updated.error || updated.data !== true) throw Error("APPEND_CAPABILITY_PRESENTATION_FAILED");
  }

  return Response.json({ success: true, requestId: input.requestId, conversationId: input.conversationId,
    userMessageId: input.userMessageId, assistantMessageId: id, answer: stored.directAnswer, response: stored,
    usage: input.usage, creditsUsed: 0, handledWithoutAi: false, dataChanged, persistence: { saved: true },
    turn: stored.turn, persistenceMode, contextUsed: { petName: pet.name, usedSources: [] } });
}

/** Called only after executeActionCapability has certified the durable receipt.
 * The client supplies an opaque capability id, never a ticket or read scope. */
export async function continueConfirmedAppend(input: {
  supabase: SupabaseClient; userId: string; assistantMessageId: string; action: FurviseApplicationAction;
}) {
  if (input.action.kind !== "care_history.add" || input.action.status !== "succeeded") return null;
  const { data, error } = await input.supabase.from("ask_conversation_messages").select("response_data,conversation_id")
    .eq("id", input.assistantMessageId).eq("user_id", input.userId).eq("role", "furvise").maybeSingle();
  if (error || !data) throw Error("APPEND_CONTINUATION_UNAVAILABLE");
  const stored = data?.response_data;
  const pending = stored?.pendingAppend;
  if (!pending) return null;
  if (pending.version !== 1 || pending.sourceMessageId !== input.action.sourceMessageId
    || pending.job.petId !== input.action.petId || !isDeepStrictEqual(pending.job, input.action.appendJob)
    || !stored.applicationActions?.some((action: FurviseApplicationAction) => action.id === input.action.id)
    || pending.conversationId !== data.conversation_id) throw Error("APPEND_CONTINUATION_SCOPE");
  const source = await input.supabase.from("ask_conversation_messages").select("id,user_text,role,created_at")
    .eq("id", pending.sourceMessageId).eq("conversation_id", data.conversation_id).eq("user_id", input.userId).eq("role", "user").maybeSingle();
  if (source.error || !source.data) throw Error("APPEND_CONTINUATION_SOURCE");
  const context = await buildFurvisePlanningContext({ ...input, petId: pending.selectedPetId, conversationId: data.conversation_id,
    sourceMessageId: pending.sourceMessageId, currentMessage: source.data.user_text, locale: pending.locale, timeZone: pending.timeZone });
  const pet = context.eligiblePets.find(pet => pet.id === pending.job.petId);
  const rebound = validateAppendJob(appendJobProposal(pending.job, pet?.name || ""),
    context.currentTurn, context.eligiblePets, input.userId);
  if (!isDeepStrictEqual(rebound, pending.job)) throw Error("APPEND_CONTINUATION_SOURCE");
  if (!pending.readTicket) return null;
  const { subjects, ...proposal } = pending.readTicket;
  if (!Array.isArray(subjects?.petIds) || subjects.petIds.some((id: string) => !context.eligiblePets.some(pet => pet.id === id && pet.user_id === input.userId))) throw Error("APPEND_CONTINUATION_SCOPE");
  // Rebind typed dimensions after JSON transport, preserving need provenance and
  // every original request obligation. These values came from the server ticket.
  const needs = pending.readTicket.needs;
  const ticket = bindTypedReadTicket({ ...proposal, ...(needs ? { needs: needs.map((need: NonNullable<import("../furvise-brain/read-ticket.ts").ReadTicket["needs"]>[number]) => ({
    needId: need.id, from: need.from, to: need.to, target: need.target, termGroups: need.termGroups, ordering: need.ordering,
  })) } : {}) }, subjects.petIds, needs || [])!;
  if (!pending.readRequest || !isDeepStrictEqual(pending.readRequest.readTicket, pending.readTicket)) throw Error("APPEND_CONTINUATION_TICKET");
  const interpretation: AskInterpretation = { version: "ask-interpretation.v1", operation: "recall", readOperation: "recall",
    petIds: [...ticket.subjects.petIds], topic: "care history", history: { from: ticket.temporal.from, to: ticket.temporal.to, terms: [], interpretation: "period" },
    episodeTopic: null, ordinal: null, readOnly: true, clarification: null, frame: emptyProposedSemanticFrame(),
    request: { ...pending.readRequest, mode: "read", appendJob: null, writeJob: null, task: null, readTicket: ticket,
      question: rebound.companion!.text } };
  const read = await retrieveAskHistory({ ...context, currentMessage: rebound.companion!.text, askInterpretation: interpretation,
    historyAccess: resolveAskHistoryAccess("free") }, input.supabase, [...ticket.subjects.petIds]);
  // Reuse the shipped deterministic list + completeness review. A continuation
  // may never open a new provider phase after a confirmed write.
  const noProvider = { responses: { create: async (): Promise<Record<string, unknown>> => { throw Error("APPEND_CONTINUATION_PROVIDER_FORBIDDEN"); } } };
  const result = await generateContextAwareAskResponse({ evidenceContract: createAskEvidenceContract(read, [...ticket.subjects.petIds]),
    profiles: context.eligiblePets, careEntries: read.askHistory?.entries || [], memories: [], productFeedback: [],
    conversationTurns: context.conversationTurns, recentUpdates: [], question: rebound.companion!.text,
    requestId: pending.sourceMessageId, locale: context.locale, client: noProvider });
  if (!result.labsList || !await reviewHistoricalAnswer({ result, client: noProvider })) throw Error("APPEND_CONTINUATION_LIST_REVIEW_FAILED");
  const labs = result.labsList;
  const rendered = buildAskConversationResponse(result.answer, { intent: "history_recall", missingUsefulDetails: [], usedContextSummary: [] });
  if (!rendered) throw Error("APPEND_CONTINUATION_NOT_A_LIST");
  const answerOutcome = ["complete", "complete_empty"].includes(labs.coverage.status) ? "complete" : "limited";
  const response = { ...stored, ...rendered,
    turn: { ...stored.turn, answerOutcome, mutationOutcome: "applied", taskOutcome: deriveAskTaskOutcome(answerOutcome, "applied") }, applicationActions: stored.applicationActions.map((action: FurviseApplicationAction) => action.id === input.action.id ? input.action : action),
    pendingAppend: pending, appendLabs: labs };
  const updated = await updateAskAssistantResponse({ messageId: input.assistantMessageId, userId: input.userId, responseData: response });
  if (updated.error || updated.data !== true) throw Error("APPEND_CONTINUATION_PUBLISH_FAILED");
  return { response, labs };
}
