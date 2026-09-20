import { brainProposalDiagnostic } from "../furvise-brain/replace-job.ts";
import "server-only";
import { calendarDateInZone } from "../ask-time-zone.ts";
import OpenAI from "openai";
import { withProviderDeadline } from "../ai/execution-deadline.ts";
import { interpretStructuredProviderResponse } from "../ai/ask-provider.ts";
import { AskPipelineError, type AskProviderEvent } from "../ai/ask-reasoning.ts";
import { AiAdmissionError } from "../ai/usage-guard/errors.ts";
import { boundedProviderTimeout, executeAdmittedProviderCall } from "../ai/usage-guard/provider-call-budget.ts";
import { buildRecentSubjectState } from "./entities/recent-subject-state.ts";
import type { FurviseLiveContext } from "./types.ts";
import type { HistoryPlan } from "./history-retrieval.ts";
import { proposedSemanticFrameJsonSchema } from "./semantic-frame/schema.ts";
import { emptyProposedSemanticFrame } from "./semantic-frame/extract-frame.ts";
import type { ProposedSemanticFrame } from "./semantic-frame/types.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { ASK_REQUEST_INSTRUCTIONS, ASK_REQUEST_VERSION, askRequestSchema, validateAskRequest, type AskRequestContract } from "./ask-request-contract.ts";

type Operation = "overview" | "recall" | "count" | "comparison" | "status" | "episode" | "general" | "update" | "clarify";
export type AskInterpretation = {
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
// Interpretation shares the route's 50-second orchestration budget; this cap
// leaves 25 seconds for retrieval/generation. No extra provider call is added.
export const ASK_INTERPRETATION_LIMITS = { outputTokens: 4096, timeoutMs: 25_000, turns: 8, turnChars: 600, terms: 6, pets: 3 } as const;
type InterpretationContext = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "pet" | "currentMessage" | "conversationTurns" | "timeZone" | "currentTurn" | "pendingTask" | "ownerNoteAlreadySaved" | "completedOwnerNote" | "ownerNoteSpans">;
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
    sourceSpans: context.ownerNoteSpans || [],
    ownerNoteSources: [...context.conversationTurns, context.pendingTask?.source, context.currentTurn]
      .filter((turn, index, turns) => turn?.role === "user" && !turn.recoveredReceiptReference && turns.findIndex(other => other?.id === turn.id) === index)
      .slice(-ASK_INTERPRETATION_LIMITS.turns - 1).map(turn => ({ id: turn!.id, text: turn!.text })),
    inputAuthority: "Only currentMessage and recentUserMessages are user-supplied factual premises. selectedPet, ownedPets, conversationSubject, today and reformulation are server routing metadata, never premiseQuotes. Profile identifiers alone do not supply the stored values the user asks for. Output labels are instructions, not factual values.",
    selectedPet: context.pet.name,
    storedNoteReferences: context.conversationTurns.filter(turn => turn.recoveredReceiptReference && turn.operationReceipt?.records.length)
      .slice(-4).map(turn => ({ id: turn.id, role: turn.role, text: turn.text, recordedAt: turn.createdAt,
        petId: turn.operationReceipt!.petId, purpose: "readback_reference_only_not_write_authority" })),
    ownedPets: context.eligiblePets.filter(pet => pet.user_id === context.owner.userId).map(pet => ({ name: pet.name, species: pet.species })),
    recentUserMessages: context.conversationTurns.filter(turn => turn.role === "user" && !turn.recoveredReceiptReference).slice(-ASK_INTERPRETATION_LIMITS.turns).map(turn => turn.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars)),
    recentDialogueForReferencesOnly: context.conversationTurns.slice(-ASK_INTERPRETATION_LIMITS.turns)
      .map(turn => ({ id: turn.id, role: turn.role, text: turn.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars) })),
    olderUserReferenceCandidates: context.conversationTurns.slice(0, -ASK_INTERPRETATION_LIMITS.turns)
      .filter(turn => turn.role === "user" && !turn.recoveredReceiptReference).slice(-ASK_INTERPRETATION_LIMITS.turns)
      .map(turn => ({ id: turn.id, text: turn.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars) })),
    dialogueAuthority: "Prior USER turns may supply observations, fictional/scenario facts and referents; olderUserReferenceCandidates are reference-only candidates for backward references and do not establish saved facts, persistence, or write authority. Only the current request authorizes a new save. ownerNoteSources supplies original note content, not proof of persistence or permission to use another account. Prior assistant turns are reference hints only.",
  };
  const request = { model, max_output_tokens: ASK_INTERPRETATION_LIMITS.outputTokens,
    ...(/^gpt-5(?:\.|-|$)/i.test(model) ? { reasoning: { effort: "low" } } : {}),
    instructions: ASK_REQUEST_INSTRUCTIONS, input: JSON.stringify(input), text: { format: { type: "json_schema", name: "furvise_ask_interpretation", strict: true, schema: askRequestSchema(proposedSemanticFrameJsonSchema, context) } } };
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
    const result = interpretStructuredProviderResponse(response, raw => JSON.parse(raw) as unknown);
    // Arrival is not validation or authority. Timed-out/late provider results never reach this point.
    const proposal = result.status === "completed" ? result.parsed : null;
    ticketArrived = !!proposal && typeof proposal === "object" && ["readTicket", "appendJob", "writeJob"]
      .some(key => key in proposal && (proposal as Record<string, unknown>)[key] != null);
    const metadata = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      parsingAttempted: result.parsingAttempted, configuredOutputLimit: ASK_INTERPRETATION_LIMITS.outputTokens, ticketArrived };
    if (result.status !== "completed") {
      const kind = result.status === "invalid" ? result.parsingAttempted ? "json" : "empty_output" : result.status;
      throw fail(`ASK_INTERPRETATION_${kind.toUpperCase()}`, kind, metadata);
    }
    console.info("[Ask Brain] proposal", brainProposalDiagnostic(result.parsed, context.currentTurn?.id));
    let parsed: AskInterpretation;
    try {
      parsed = recoverAskInterpretation(result.parsed, context);
      if (parsed.planningRecovery) throw new AskInterpretationValidationError(parsed.planningRecovery, "semantic");
    }
    catch (error) {
      if (error instanceof AskInterpretationValidationError) throw fail(error.reason, error.category, metadata);
      throw fail("ASK_INTERPRETATION_VALIDATION", "semantic", metadata);
    }
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
export function readInterpretationSubject(interpretation: AskInterpretation, selectedPetId: string) {
  const subjects = interpretation.readOnly && interpretation.readPetIds?.length
    ? interpretation.readPetIds : interpretation.petIds;
  return {
    usedProviderExtraction: true,
    resolution: {
      status: interpretation.conversationOnly ? "resolved" as const : subjects.length > 1 ? "multi_subject" as const : subjects.length ? "resolved" as const : "ambiguous" as const,
      petId: subjects[0] || (interpretation.conversationOnly ? selectedPetId : null),
      petIds: subjects,
      reasonCode: null,
      requiresClarification: interpretation.clarification === "subject",
      explicitSubject: !interpretation.conversationOnly,
      confidence: 1,
    },
  };
}
