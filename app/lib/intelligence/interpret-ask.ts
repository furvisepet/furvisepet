import { brainProposalDiagnostic } from "../furvise-brain/replace-job.ts";
import "server-only";
import { calendarDateInZone } from "../ask-time-zone.ts";
import OpenAI from "openai";
import { factorProviderEnumSchemas } from "../ai/provider-enum-schema.ts";
import { factorProviderCompoundSchemas } from "../ai/provider-compound-schema.ts";
import { withProviderDeadline } from "../ai/execution-deadline.ts";
import { ASK_MAX_OUTPUT_TOKENS, interpretStructuredProviderResponse } from "../ai/ask-provider.ts";
import { AskPipelineError, type AskProviderEvent } from "../ai/ask-reasoning.ts";
import { AiAdmissionError } from "../ai/usage-guard/errors.ts";
import { boundedProviderTimeout, executeAdmittedProviderCall } from "../ai/usage-guard/provider-call-budget.ts";
import { buildRecentSubjectState } from "./entities/recent-subject-state.ts";
import type { FurviseLiveContext } from "./types.ts";
import type { HistoryPlan } from "./history-retrieval.ts";
import { proposedSemanticFrameJsonSchema } from "./semantic-frame/schema.ts";
import { emptyProposedSemanticFrame } from "./semantic-frame/extract-frame.ts";
import type { ProposedSemanticFrame } from "./semantic-frame/types.ts";
import type { AskTurnSubjectDecision } from "./entities/resolve-turn-subject.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { ASK_REQUEST_INSTRUCTIONS, ASK_REQUEST_VERSION, askRequestProviderSchema, validateAskRequest, type AskRequestContract } from "./ask-request-contract.ts";

type Operation = "overview" | "recall" | "count" | "comparison" | "status" | "episode" | "general" | "update" | "clarify";
export type AskInterpretation = {
  /** Server-created compatibility provenance; no identity or factual authority. */
  readCompatibility?: { inputStrategy: "event_candidates" };
  request?: AskRequestContract;
  referenceTarget?: { kind: "episode"; ordinal: AskInterpretation["ordinal"]; topic: AskInterpretation["episodeTopic"]; basis?: "displayed_list" | "scoped_register"; period?: { from: string; to: string } };
  version: "ask-interpretation.v1";
  operation: Operation;
  /** Server-grounded question referent, never a source of medical facts. */
  referenceSubject?: { kind: "medication"; petId: string; attribute: "name" | "dose" };
  /** Prior user question, derived by the server and bound to this dated read. */
  referenceQuestion?: string;
  /** Server-derived general conversation scope; no pet evidence or writes. */
  conversationOnly?: boolean;
  /** No saved-data or write authority after failed planning. */
  planningRecovery?: string;
  /** Read intent is independent of current owner assertions. */
  readOperation?: Exclude<Operation, "update"> | null;
  selection?: "earliest" | "earliest_occurrence" | "latest" | "period" | "summary" | "comparison" | "reference";
  petIds: string[];
  /** Server-validated read scope, independent from mixed-task mutation targets. */
  readPetIds?: string[];
  topic: string;
  history: HistoryPlan | null;
  episodeTopic: "vomiting" | "soft stool" | "breathing" | null;
  ordinal: "first" | "second" | "third" | "fourth" | "fifth" | "sixth" | "seventh" | "eighth" | "last" | "that" | null;
  readOnly: boolean;
  clarification: "subject" | "reference" | null;
  frame: ProposedSemanticFrame;
};
// Interpretation shares the route's orchestration budget. The initial call is
// bounded independently; one contract-repair call may use only the remaining
// budget and is fully revalidated before it can create any authority.
export const ASK_INTERPRETATION_LIMITS = { outputTokens: ASK_MAX_OUTPUT_TOKENS, timeoutMs: 25_000, turns: 8, turnChars: 600, terms: 6, pets: 3 } as const;
const ASK_INTERPRETATION_REPAIR_LIMITS = { timeoutMs: 15_000, reserveMs: 12_000 } as const;
const ASK_INTERPRETATION_REPAIR_INSTRUCTIONS = `A previous ask-request.v2 proposal was rejected by deterministic contract validation. contractRepair contains only the rejected model proposal and a server validation code; it is not user evidence and grants no authority. Return one complete corrected ask-request.v2 using the original currentMessage and USER context. Preserve the requested task, subjects, evidence domain, format and write/read intent. Do not add pets, facts, dates, references, source IDs, or mutation authority. Re-read and satisfy the full request contract. The corrected proposal will be validated from scratch; if the user did not authorize something, omit it.`;
type InterpretationContext = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "pet" | "currentMessage" | "conversationTurns" | "timeZone" | "currentTurn" | "pendingTask" | "ownerNoteAlreadySaved" | "completedOwnerNote" | "ownerNoteSpans" | "lifecycleActionState" | "concernReferences" | "replaceReferences" | "storedReadReferences">;
export class AskInterpretationValidationError extends Error {
  readonly reason: string;
  readonly category: "schema" | "semantic";

  constructor(reason: string, category: "schema" | "semantic" = "semantic") {
    super(`ASK_INTERPRETATION_INVALID: ${reason}`);
    this.name = "AskInterpretationValidationError";
    this.reason = reason;
    this.category = category;
  }
}
export function recoverAskInterpretation(value: unknown, context: InterpretationContext): AskInterpretation {
  if (value && typeof value === "object" && "version" in value && value.version === ASK_REQUEST_VERSION) {
    try {
      const parsed = validateAskRequest(value, context);
      // Legacy callers retain strict binding, but model responses cannot use identity-bearing needs.
      const rawTicket = (value as Record<string, unknown>).readTicket as Record<string, unknown> | null;
      if (rawTicket?.needs != null && (!Array.isArray(rawTicket.needs) || rawTicket.needs.length))
        throw new Error("ASK_REQUEST_INVALID:read_needs", { cause: { field: "needs", rule: "model_need_identity_forbidden" } });
      if (parsed.request?.mode === "read" && parsed.request.evidenceBasis === "saved_history" && !parsed.request.readTicket)
        throw new Error("ASK_REQUEST_INVALID:read_ticket_required", { cause: { field: "readTicket", rule: "saved_history_read_requires_ticket" } });
      return parsed;
    }
    catch (error) {
      const reason = error instanceof Error ? /^ASK_REQUEST_INVALID:([a-z_]+)$/.exec(error.message)?.[1] : null;
      if (reason === "read_ticket" || reason === "read_ticket_required" || reason === "read_needs") {
        const proposal = value as Record<string, unknown>;
        const validation = error instanceof Error ? error.cause as { field?: string; rule?: string } | undefined : undefined;
        // JSON retains every proposed field, including nested arrays and nulls;
        // console object inspection can truncate these and hide the failing shape.
        // This diagnostic is server-only. It never changes the rejected proposal.
        console.warn("[Ask Brain] rejected read ticket", JSON.stringify({
          errorCode: `ASK_REQUEST_CONTRACT_${reason.toUpperCase()}`,
          sourceMessageId: context.currentTurn?.id ?? null,
          field: validation?.field ?? null,
          rule: validation?.rule ?? validation?.field ?? null,
          readTicketPresent: Object.hasOwn(proposal, "readTicket"),
          readTicket: proposal.readTicket ?? null,
          needs: (proposal.readTicket as Record<string, unknown> | null)?.needs ?? null,
          request: { mode: proposal.mode, operation: proposal.operation, scope: proposal.scope,
            petNames: proposal.petNames, evidenceBasis: proposal.evidenceBasis, writeJob: proposal.writeJob ?? null },
        }));
      }
      if (reason === "write_job") {
        console.warn("[Ask Brain] rejected write job", JSON.stringify({
          ...brainProposalDiagnostic(value, context.currentTurn?.id),
          validation: error instanceof Error ? error.cause : null,
        }));
      }
      if (["reference", "scope"].includes(reason || "") && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
        && "mode" in value && ["read", "conversation", "clarify"].includes(String(value.mode)))
        return unavailableAskReadPlan("ASK_REQUEST_CONTRACT_" + reason!.toUpperCase());
      throw new AskInterpretationValidationError(reason ? `ASK_REQUEST_CONTRACT_${reason.toUpperCase()}` : "ASK_REQUEST_CONTRACT", "semantic");
    }
  }
  throw new AskInterpretationValidationError("ASK_REQUEST_CONTRACT_VERSION", "schema");
}

function parseProviderAskRequest(raw: string): unknown {
  const value = JSON.parse(raw) as unknown;
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && Object.hasOwn(value, "request"))
    return (value as Record<string, unknown>).request;
  // Direct Node fixtures predate the provider envelope. Production/development
  // provider responses must satisfy the envelope emitted in Structured Outputs.
  if (process.env.NODE_TEST_CONTEXT) return value;
  throw new Error("ASK_PROVIDER_REQUEST_ENVELOPE");
}

function sumUsage(left: number | null, right: number | null) {
  return left === null && right === null ? null : (left || 0) + (right || 0);
}

/** Failed planning has no history or mutation authority. */
function unavailableAskReadPlan(reason: string): AskInterpretation {
  return { version: "ask-interpretation.v1", operation: "general", readOperation: "general", selection: "summary",
    conversationOnly: true, planningRecovery: reason, petIds: [], topic: "general conversation", history: null,
    episodeTopic: null, ordinal: null, readOnly: true, clarification: null, frame: emptyProposedSemanticFrame() };
}

export async function interpretAskQuestion({ context, model, client, onProviderEvent }: {
  context: InterpretationContext; model: string;
  onProviderEvent?: (event: AskProviderEvent) => void;
  client?: { responses: { create: (request: Record<string, unknown>, options?: { signal: AbortSignal }) => Promise<Record<string, unknown>> } };
}): Promise<AskInterpretation> {
  const state = buildRecentSubjectState({ pets: context.eligiblePets.filter(pet => pet.user_id === context.owner.userId), selectedPetId: context.pet.id, recentConversation: context.conversationTurns });
  const input = { pendingTask: context.pendingTask || null, currentTurn: context.currentTurn || null, timeZone: context.timeZone || "UTC", conversationSubject: state.entities.find(entity => entity.key === state.currentFocusKey)?.label || null, currentMessage: context.currentMessage, today: calendarDateInZone(new Date().toISOString(), context.timeZone),
    storedReadReferences: (context.storedReadReferences || []).filter(r => r.ownerId === context.owner.userId)
      .map(r => ({ ref:r.ref, action:r.actionKind, requestedAt:r.createdAt,
        sourceTurnId:r.sourceMessageId, subject:context.eligiblePets.find(p=>p.id===r.petId)?.name || "Former owned subject" })),
    replaceTargets: (context.replaceReferences || []).filter(r => r.ownerId === context.owner.userId)
      .map(r => ({ ref: r.ref, petName: context.eligiblePets.find(p => p.id === r.petId && p.user_id === r.ownerId)?.name,
        body: r.body, eventAt: r.eventAt })),
    concernTargets: (context.concernReferences || []).filter(r => r.ownerId === context.owner.userId)
      .map(r => ({ targetRef: r.ref, petName: context.eligiblePets.find(p => p.id === r.petId && p.user_id === r.ownerId)?.name,
        title: r.title, currentState: r.status })),
    lifecycleState: { pendingKnown: context.lifecycleActionState?.complete === true,
      pending: context.lifecycleActionState?.complete ? context.lifecycleActionState.actions
        .filter(action => ["pet.mark_deceased", "pet.archive", "pet.mark_active"].includes(action.kind)
          && ["proposed", "confirmation_required"].includes(action.status))
        .map(action => ({ subject: context.eligiblePets.find(pet => pet.user_id === context.owner.userId && pet.id === action.petId)?.name,
          state: action.kind === "pet.mark_deceased" ? "deceased" : action.kind === "pet.archive" ? "archived" : "active" })) : [] },
    sourceSpans: context.ownerNoteSpans || [],
    ownerNoteSources: [...context.conversationTurns, context.pendingTask?.source, context.currentTurn]
      .filter((turn, index, turns) => turn?.role === "user" && !turn.recoveredReceiptReference && turns.findIndex(other => other?.id === turn.id) === index)
      .slice(-ASK_INTERPRETATION_LIMITS.turns - 1).map(turn => ({ id: turn!.id, text: turn!.text })),
    inputAuthority: "Only currentMessage and recentUserMessages are user-supplied factual premises. selectedPet, ownedPets, conversationSubject, today and reformulation are server routing metadata, never premiseQuotes. Profile identifiers alone do not supply the stored values the user asks for. Output labels are instructions, not factual values.",
    selectedPet: context.pet.name,
    storedNoteReferences: context.conversationTurns.filter(turn => turn.recoveredReceiptReference && turn.operationReceipt?.records.length)
      .slice(-4).map(turn => ({ id: turn.id, role: turn.role, text: turn.text, recordedAt: turn.createdAt,
        petId: turn.operationReceipt!.petId, purpose: "readback_reference_only_not_write_authority" })),
    ownedPets: context.eligiblePets.filter(pet => pet.user_id === context.owner.userId).map(pet => ({ name: pet.name, species: pet.species, lifecycleState: pet.lifecycle_status ?? "active" })),
    recentUserMessages: context.conversationTurns.filter(turn => turn.role === "user" && !turn.recoveredReceiptReference).slice(-ASK_INTERPRETATION_LIMITS.turns).map(turn => turn.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars)),
    recentDialogueForReferencesOnly: context.conversationTurns.slice(-ASK_INTERPRETATION_LIMITS.turns)
      .map(turn => ({ id: turn.id, role: turn.role, text: turn.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars) })),
    olderUserReferenceCandidates: context.conversationTurns.slice(0, -ASK_INTERPRETATION_LIMITS.turns)
      .filter(turn => turn.role === "user" && !turn.recoveredReceiptReference).slice(-ASK_INTERPRETATION_LIMITS.turns)
      .map(turn => ({ id: turn.id, text: turn.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars) })),
    dialogueAuthority: "Prior USER turns may supply observations, fictional/scenario facts and referents; olderUserReferenceCandidates are reference-only candidates for backward references and do not establish saved facts, persistence, or write authority. Only the current request authorizes a new save. ownerNoteSources supplies original note content, not proof of persistence or permission to use another account. Prior assistant turns are reference hints only.",
  };
  const request = { model, max_output_tokens: ASK_INTERPRETATION_LIMITS.outputTokens,
    ...(/^gpt-5\.4(?:-|$)/i.test(model) ? { reasoning: { effort: "none" } } : /^gpt-5(?:\.|-|$)/i.test(model) ? { reasoning: { effort: "low" } } : {}),
    instructions: ASK_REQUEST_INSTRUCTIONS, input: JSON.stringify(input), text: { format: { type: "json_schema", name: "furvise_ask_interpretation", strict: true, schema: factorProviderCompoundSchemas(factorProviderEnumSchemas(askRequestProviderSchema(proposedSemanticFrameJsonSchema, context))) } } };
  const started = Date.now();
  let attempted = false;
  let ticketArrived = false;
  let providerSignal: AbortSignal | undefined;
  const fail = (reason: string, kind: string, extras: Partial<AskProviderEvent> = {}) => new AskPipelineError("interpretation_failed",
    "I couldn't understand the request reliably this time. Please try again.",
    { model, elapsedMs: Date.now() - started, providerErrorCode: reason, providerErrorType: kind, ticketArrived, ...extras });
  try {
    const activeClient = client || new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }) as unknown as NonNullable<typeof client>;
    const response = await executeAdmittedProviderCall({ model, maxOutputTokens: ASK_INTERPRETATION_LIMITS.outputTokens,
      stage: "interpretation", reserveMs: 24_000,
      providerInput: { input: request.input, instructions: request.instructions },
      invoke: () => {
        attempted = true;
        onProviderEvent?.({ stage: "interpretation", outcome: "started", model, elapsedMs: 0, configuredOutputLimit: ASK_INTERPRETATION_LIMITS.outputTokens });
        return withProviderDeadline(signal => {
          providerSignal = signal;
          return activeClient.responses.create(request as never, { signal });
        }, boundedProviderTimeout(ASK_INTERPRETATION_LIMITS.timeoutMs, 24_000, "interpretation"));
      } });
    const result = interpretStructuredProviderResponse(response, parseProviderAskRequest);
    // Arrival is not validation or authority. Timed-out/late provider results never reach this point.
    const proposal = result.status === "completed" ? result.parsed : null;
    ticketArrived = !!proposal && typeof proposal === "object" && ["readTicket", "appendJob", "writeJob"]
      .some(key => key in proposal && (proposal as Record<string, unknown>)[key] != null);
    let metadata = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      parsingAttempted: result.parsingAttempted, configuredOutputLimit: ASK_INTERPRETATION_LIMITS.outputTokens, ticketArrived };
    if (result.status !== "completed") {
      const kind = result.status === "invalid" ? result.parsingAttempted ? "json" : "empty_output" : result.status;
      throw fail(`ASK_INTERPRETATION_${kind.toUpperCase()}`, kind, metadata);
    }
    console.info("[Ask Brain] proposal", brainProposalDiagnostic(result.parsed, context.currentTurn?.id));
    let parsed: AskInterpretation;
    try {
      parsed = recoverAskInterpretation(result.parsed, context);
    }
    catch (error) {
      const rejected = result.parsed && typeof result.parsed === "object" ? result.parsed as Record<string, unknown> : null;
      const repairableProfileContract = rejected?.mode === "read" && rejected.evidenceBasis === "saved_profile";
      if (!(error instanceof AskInterpretationValidationError) || error.category !== "semantic" || !repairableProfileContract) {
        if (error instanceof AskInterpretationValidationError) throw fail(error.reason, error.category, metadata);
        throw fail("ASK_INTERPRETATION_VALIDATION", "semantic", metadata);
      }
      const repairRequest = { ...request,
        instructions: `${ASK_REQUEST_INSTRUCTIONS}\n\n${ASK_INTERPRETATION_REPAIR_INSTRUCTIONS}`,
        input: JSON.stringify({ ...input, contractRepair: { validationCode: error.reason, rejectedProposal: result.parsed } }) };
      console.info("[Ask Brain] contract repair", { sourceMessageId: context.currentTurn?.id, validationCode: error.reason });
      const repairResponse = await executeAdmittedProviderCall({ purpose: "interpretation_repair", model,
        maxOutputTokens: ASK_INTERPRETATION_LIMITS.outputTokens, stage: "interpretation", reserveMs: ASK_INTERPRETATION_REPAIR_LIMITS.reserveMs,
        providerInput: { input: repairRequest.input, instructions: repairRequest.instructions },
        invoke: () => {
          onProviderEvent?.({ stage: "interpretation", outcome: "started", model, elapsedMs: Date.now() - started,
            configuredOutputLimit: ASK_INTERPRETATION_LIMITS.outputTokens, validationDetails: "bounded_contract_repair" });
          return withProviderDeadline(signal => {
            providerSignal = signal;
            return activeClient.responses.create(repairRequest as never, { signal });
          }, boundedProviderTimeout(ASK_INTERPRETATION_REPAIR_LIMITS.timeoutMs, ASK_INTERPRETATION_REPAIR_LIMITS.reserveMs, "interpretation"));
        } });
      const repaired = interpretStructuredProviderResponse(repairResponse, parseProviderAskRequest);
      const repairedProposal = repaired.status === "completed" ? repaired.parsed : null;
      ticketArrived = ticketArrived || !!repairedProposal && typeof repairedProposal === "object" && ["readTicket", "appendJob", "writeJob"]
        .some(key => key in repairedProposal && (repairedProposal as Record<string, unknown>)[key] != null);
      metadata = { inputTokens: sumUsage(result.usage.inputTokens, repaired.usage.inputTokens),
        outputTokens: sumUsage(result.usage.outputTokens, repaired.usage.outputTokens), parsingAttempted: repaired.parsingAttempted,
        configuredOutputLimit: ASK_INTERPRETATION_LIMITS.outputTokens, ticketArrived };
      if (repaired.status !== "completed") {
        const kind = repaired.status === "invalid" ? repaired.parsingAttempted ? "json" : "empty_output" : repaired.status;
        throw fail(`ASK_INTERPRETATION_REPAIR_${kind.toUpperCase()}`, kind, metadata);
      }
      console.info("[Ask Brain] repaired proposal", brainProposalDiagnostic(repaired.parsed, context.currentTurn?.id));
      try { parsed = recoverAskInterpretation(repaired.parsed, context); }
      catch (repairError) {
        if (repairError instanceof AskInterpretationValidationError) throw fail(repairError.reason, repairError.category, metadata);
        throw fail("ASK_INTERPRETATION_VALIDATION", "semantic", metadata);
      }
    }
    if (parsed.planningRecovery) throw fail(parsed.planningRecovery, "semantic", metadata);
    console.info("[Ask Brain] validated", { sourceMessageId: context.currentTurn?.id, mode: parsed.request?.mode,
      operation: parsed.request?.writeJob?.operation ?? parsed.operation, readTicket: parsed.request?.readTicket || null, writeJob: parsed.request?.writeJob
        ? { target: parsed.request.writeJob.target, petId: parsed.request.writeJob.petId, bodyStart: parsed.request.writeJob.body.start, bodyEnd: parsed.request.writeJob.body.end } : null });
    onProviderEvent?.({ stage: "interpretation", outcome: "succeeded", model, elapsedMs: Date.now() - started, ...metadata });
    return parsed;
  } catch (error) {
    if (error instanceof AiAdmissionError) {
      if (attempted) onProviderEvent?.({ stage: "interpretation", outcome: "failed", model, elapsedMs: Date.now() - started, providerErrorCode: "ASK_INTERPRETATION_ADMISSION" });
      throw error;
    }
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : null;
    const timedOut = providerSignal?.aborted === true
      || error instanceof Error && ["TimeoutError", "APIConnectionTimeoutError"].includes(error.name);
    const failure = error instanceof AskPipelineError ? error : fail(timedOut ? "ASK_INTERPRETATION_TIMEOUT" : "ASK_INTERPRETATION_TRANSPORT", "transport", { providerStatus: status, timedOut });
    onProviderEvent?.({ stage: "interpretation", outcome: "failed", ...failure.diagnostics });
    throw failure;
  }
}

/** The conversation has a selected-pet container; that is not evidence authority. */
export function readInterpretationSubject(interpretation: AskInterpretation, selectedPetId: string,
  ownership?: { ownerId: string; pets: Array<{ id: string; user_id?: string }> }): AskTurnSubjectDecision {
  const request = interpretation.request;
  // Bound jobs own scope. Envelope IDs are Binder output only for domains that
  // have no record ticket (for example typed profile reads).
  const ownerRead = request?.storedRead?.scope === "owner";
  if (request?.storedRead && ownership && request.storedRead.ownerId !== ownership.ownerId) throw Error("ASK_BOUND_SUBJECT_NOT_OWNED");
  const subjects = request?.storedRead ? [...request.storedRead.subjectIds]
    : request?.appendJob ? [request.appendJob.petId]
    : request?.writeJob ? [request.writeJob.petId]
    : request?.stateTransitionJob ? [request.stateTransitionJob.petId]
    : request?.fieldMutationJob ? request.fieldMutationJob.domain === "pet_profile" ? [request.fieldMutationJob.petId] : []
    : request?.readTicket ? [...request.readTicket.subjects.petIds]
    : request?.lifecyclePlan ? request.lifecyclePlan.subjects.map(subject => subject.petId)
    : interpretation.readOnly && interpretation.readPetIds?.length ? interpretation.readPetIds : interpretation.petIds;
  if (ownership && subjects.some(id => !ownership.pets.some(pet => pet.id === id && pet.user_id === ownership.ownerId))) {
    throw Error("ASK_BOUND_SUBJECT_NOT_OWNED");
  }
  return {
    frame: interpretation.frame,
    usedProviderExtraction: true,
    resolution: {
      status: interpretation.conversationOnly || ownerRead ? "resolved" as const : subjects.length > 1 ? "multi_subject" as const : subjects.length ? "resolved" as const : "ambiguous" as const,
      petId: subjects[0] || (interpretation.conversationOnly || ownerRead ? selectedPetId : null),
      petIds: subjects,
      reasonCode: null,
      requiresClarification: interpretation.clarification === "subject",
      explicitSubject: !interpretation.conversationOnly,
      confidence: 1,
    },
  };
}
