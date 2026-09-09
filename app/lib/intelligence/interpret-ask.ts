import { datedNoteReformulation, normalizeAskReadProposal, unavailableAskReadPlan } from "./ask-plan-recovery.ts";
import { medicationReferencePet } from "./medication-reference.ts";
import { normalizeHistoricalSearchTerms } from "./history-search-terms.ts";
import "server-only";
import OpenAI from "openai";
import { interpretStructuredProviderResponse } from "../ai/ask-provider.ts";
import { AskPipelineError, type AskProviderEvent } from "../ai/ask-reasoning.ts";
import { AiAdmissionError } from "../ai/usage-guard/errors.ts";
import { boundedProviderTimeout, executeAdmittedProviderCall } from "../ai/usage-guard/provider-call-budget.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";
import { buildRecentSubjectState, resolveRecentPronoun } from "./entities/recent-subject-state.ts";
import type { FurviseLiveContext } from "./types.ts";
import type { HistoryPlan } from "./history-retrieval.ts";
import { proposedSemanticFrameJsonSchema } from "./semantic-frame/schema.ts";
import { validateProposedSemanticFrame, emptyProposedSemanticFrame } from "./semantic-frame/extract-frame.ts";
import type { ProposedSemanticFrame } from "./semantic-frame/types.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { askEvidenceScope } from "./ask-evidence.ts";
import { ASK_REQUEST_INSTRUCTIONS, ASK_REQUEST_VERSION, askRequestSchema, validateAskRequest, type AskRequestContract } from "./ask-request-contract.ts";

const operations = ["overview", "recall", "count", "comparison", "status", "episode", "general", "update", "clarify"] as const;
const selections = ["earliest", "earliest_occurrence", "latest", "period", "summary", "comparison", "reference"] as const;
const subjects = ["selected", "conversation", "explicit", "unclear", "non_pet"] as const;
const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "last", "that"] as const;
type Operation = typeof operations[number];
export type AskInterpretation = {
  request?: AskRequestContract;
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
  selection?: typeof selections[number];
  petIds: string[];
  topic: string;
  history: HistoryPlan | null;
  episodeTopic: "vomiting" | "soft stool" | "breathing" | null;
  ordinal: typeof ordinals[number] | null;
  readOnly: boolean;
  clarification: "subject" | "reference" | null;
  frame: ProposedSemanticFrame;
};
// Interpretation shares the route's 50-second orchestration budget; this cap
// leaves 30 seconds for retrieval/generation. No extra provider call is added.
export const ASK_INTERPRETATION_LIMITS = { outputTokens: 2600, timeoutMs: 20_000, turns: 8, turnChars: 600, terms: 6, pets: 3 } as const;
const nullableString = { type: ["string", "null"] };
export const askInterpretationSchema = {
  type: "object", additionalProperties: false,
  required: ["selection", "operation", "readOperation", "subject", "petNames", "topic", "terms", "from", "to", "episodeTopic", "ordinal", "frame"],
  properties: {
    selection: { type: "string", enum: selections },
    readOperation: { type: ["string", "null"], enum: [...operations.filter(value => value !== "update"), null] },
    frame: proposedSemanticFrameJsonSchema,
    operation: { type: "string", enum: operations }, subject: { type: "string", enum: subjects },
    petNames: { type: "array", items: { type: "string" } }, topic: { type: "string" },
    terms: { type: "array", maxItems: 6, items: { type: "string", minLength: 3, maxLength: 32, pattern: "^[A-Za-z][A-Za-z -]*[A-Za-z]$" } }, from: nullableString, to: nullableString,
    episodeTopic: { type: ["string", "null"], enum: ["vomiting", "soft stool", "breathing", null] },
    ordinal: { type: ["string", "null"], enum: [...ordinals, null] },
  },
};


type InterpretationContext = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "pet" | "currentMessage" | "conversationTurns">;
export class AskInterpretationValidationError extends Error {
  constructor(readonly reason: string, readonly category: "schema" | "semantic" = "semantic") {
    super(`ASK_INTERPRETATION_INVALID: ${reason}`); this.name = "AskInterpretationValidationError";
  }
}
const invalid = (reason = "ASK_INTERPRETATION_SCHEMA", category: "schema" | "semantic" = "schema"): never => { throw new AskInterpretationValidationError(reason, category); };
/** Validate every field before a plan may affect subject selection or retrieval.
 * Model text never becomes a database filter, identifier or write instruction. */
export function validateAskInterpretation(value: unknown, context: InterpretationContext): AskInterpretation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const p = { ...value as Record<string, unknown> };
  const required = askInterpretationSchema.required.filter(key => (key !== "readOperation" && key !== "selection") || key in p);
  if (Object.keys(p).sort().join() !== [...required].sort().join()
    || "selection" in p && !selections.includes(p.selection as typeof selections[number])
    || "readOperation" in p && p.readOperation !== null && (!operations.includes(p.readOperation as Operation) || p.readOperation === "update")
    || !operations.includes(p.operation as Operation) || !subjects.includes(p.subject as typeof subjects[number])
    || !Array.isArray(p.petNames) || p.petNames.length > 3 || p.petNames.some(n => typeof n !== "string" || n.length > 100)
    || typeof p.topic !== "string" || p.topic.length > 80
    || !["vomiting", "soft stool", "breathing", null].includes(p.episodeTopic as string | null)
    || !(p.ordinal === null || ordinals.includes(p.ordinal as typeof ordinals[number]))) return invalid();
  if (!Array.isArray(p.terms) || p.terms.length > 6 || p.terms.some(t => typeof t !== "string" || t.length < 3 || t.length > 32 || !/^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(t))) return invalid("ASK_INTERPRETATION_TERMS", "schema");
  // Retrieval-only metadata is irrelevant to a pure update. Discard it instead
  // of allowing a half-range to fail a conversational response. This does not
  // change frame validation or authorize any lookup or mutation.
  if (p.operation === "update" && p.readOperation === null) {
    p.from = null;
    p.to = null;
  }
  const date = (v: unknown) => v === null || typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v && v >= "1900-01-01" && v <= "2100-01-01";
  if (!date(p.from) || !date(p.to) || (p.from === null) !== (p.to === null)
    || p.from !== null && String(p.from) >= String(p.to)) return invalid("ASK_INTERPRETATION_DATES", "semantic");
  let operation = p.operation as Operation;
  if (operation === "update" && (analyzeOwnerAssertions(context.currentMessage).isPureQuestion
    || askEvidenceScope(context.currentMessage, []).readOnlyRecall)) return invalid("ASK_INTERPRETATION_UPDATE_INTENT", "semantic");
  // Legacy in-process callers may omit readOperation; production schema requires it.
  let readOperation = ("readOperation" in p ? p.readOperation : operation === "update"
    ? (p.terms.length || p.from ? "recall" : null) : operation) as AskInterpretation["readOperation"];
  // readOperation repeats operation on a non-update. Recover an omitted
  // duplicate, not a conflicting plan. Subject, dates, ordinals and all write
  // permissions still undergo their independent validation below.
  if (operation !== "update" && readOperation === null) readOperation = operation;
  if (operation !== "update" && readOperation !== operation
    && !(operation === "general" && ["overview", "recall", "comparison", "status"].includes(readOperation || ""))) return invalid("ASK_INTERPRETATION_READ_OPERATION", "semantic");
  // A read-only turn cannot use mutation metadata. Discard it altogether,
  // including malformed model proposals, instead of failing a valid read plan.
  // Genuine owner assertions retain strict frame validation.
  const frameValidation = analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    ? validateProposedSemanticFrame(p.frame) : { frame: emptyProposedSemanticFrame() };
  if (!frameValidation.frame) return invalid("ASK_INTERPRETATION_FRAME", "schema");
  if (readOperation !== "episode" && p.ordinal !== null || readOperation === "episode" && p.ordinal === null) return invalid("ASK_INTERPRETATION_EPISODE_REFERENCE", "semantic");
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  const named = explicitlyNamedOwnedPets(context.currentMessage, owned);
  const proposed = p.petNames.map(name => {
    const found = owned.filter(pet => pet.name?.toLocaleLowerCase() === String(name).toLocaleLowerCase());
    if (found.length !== 1) return invalid("ASK_INTERPRETATION_OWNERSHIP", "semantic");
    return found[0].id;
  });
  let petIds: string[] = [];
  const state = buildRecentSubjectState({ pets: owned, selectedPetId: context.pet.id, recentConversation: context.conversationTurns });
  const focus = state.entities.find(entity => entity.key === state.currentFocusKey);
  const pronouns = context.currentMessage.match(/\b(?:he|him|his|she|her|hers|they|them|their|it|its)\b/gi) || [];
  const ambiguousPronoun = !named.length && pronouns.some(pronoun => resolveRecentPronoun(state, pronoun).status === "ambiguous");
  const accountWide = !named.length && (/\b(?:all (?:of )?my pets|all (?:of )?our pets|across my pets|which (?:of my )?pets|(?:each|every) (?:of my )?pet|(?:my|the|these|all) (?:two|three|[23]) pets)\b/i.test(context.currentMessage)
    || /\bwhich pet\b/i.test(context.currentMessage) && /\b(?:notes?|records?|recorded|history)\b/i.test(context.currentMessage))
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion;
  const correctionSubjects = !named.length && /\bwhich (?:pet|dog|cat|animal)\b/i.test(context.currentMessage)
    && /\b(?:correction|corrected (?:note|report)|retraction)\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion;
  if ((accountWide || correctionSubjects) && p.subject !== "non_pet") {
    // The explicit account-wide request supplies scope, not optional model names.
    // Proposed names still pass ownership validation above; read bounds remain.
    if (owned.length > ASK_INTERPRETATION_LIMITS.pets) return invalid("ASK_INTERPRETATION_SUBJECT", "semantic");
    petIds = owned.map(pet => pet.id);
  } else if (named.length && p.subject !== "unclear" && p.subject !== "non_pet") {
    // Explicit current names are server-owned authority, independent of the
    // model's selected/conversation label. Conflicting proposed names still fail.
    if (proposed.length && (named.length !== new Set(proposed).size || named.some(pet => !proposed.includes(pet.id)))) return invalid("ASK_INTERPRETATION_SUBJECT", "semantic");
    petIds = named.map(pet => pet.id);
  } else if (!ambiguousPronoun && (p.subject === "conversation" || p.subject === "explicit")) {
    // A model can label a previously named active pet as explicit. Accept only
    // agreement with the USER-established focus, never an invented owned pet.
    if (focus?.kind === "pet" && focus.petId) petIds = [focus.petId];
    else if (p.subject === "conversation" && !state.entities.some(entity => entity.lastMentionTurn >= 0 || entity.lastSubjectTurn >= 0)
      && owned.some(pet => pet.id === context.pet.id)) petIds = [context.pet.id];
    if (p.subject === "explicit" && (!proposed.length || !petIds.length)) return invalid("ASK_INTERPRETATION_SUBJECT", "semantic");
  } else if (!ambiguousPronoun && p.subject === "selected") petIds = owned.some(pet => pet.id === context.pet.id) ? [context.pet.id] : [];
  if (!accountWide && !correctionSubjects && !ambiguousPronoun && p.subject !== "unclear" && p.subject !== "non_pet" && proposed.length && (proposed.length !== petIds.length || proposed.some(id => !petIds.includes(id)))) return invalid("ASK_INTERPRETATION_SUBJECT", "semantic");
  if (petIds.length > ASK_INTERPRETATION_LIMITS.pets) return invalid();
  // A plain named-topic follow-up is an ordinary read, even if the model labels
  // it clarify. Only recover a topic literally present after one owned name;
  // never manufacture episode references, dates, subjects or write authority.
  let recoveredTopic: string | null = null;
  if (operation === "clarify" && readOperation === "clarify" && named.length === 1
    && petIds.length === 1 && p.ordinal === null && p.from === null) {
    const followUp = context.currentMessage.trim().match(/^(?:what|how) about\s+(.+?)[?.!]*$/i)?.[1] || "";
    const name = named[0].name || "";
    if (name && followUp.toLocaleLowerCase().startsWith(name.toLocaleLowerCase())) {
      const tail = followUp.slice(name.length);
      const topic = tail.replace(/^(?:['\u2019]s)?\s+/, "").trim();
      if (/^(?:['\u2019]s)?\s+/.test(tail) && /^[A-Za-z][A-Za-z -]{1,30}[A-Za-z]$/.test(topic)
        && !/\b(?:that|those|these|it|one|first|second|third|fourth|fifth|last|episode|episodes|count|many)\b/i.test(topic)) {
        recoveredTopic = topic;
        operation = "recall";
        readOperation = "recall";
      }
    }
  }
  // A general conversational act may still ask about saved facts. Explicit
  // history/record requests with an owned subject must use the evidence path.
  if (operation === "general" && readOperation === "general" && petIds.length
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    && /\b(?:history|records?|reports?)\b/i.test(context.currentMessage)) readOperation = "recall";
  const conversationOnly = operation === "general" && readOperation === "general"
    && p.subject === "non_pet" && !proposed.length
    && (!named.length || !p.terms.length && p.from === null
      && !/\b(?:summari[sz]e|recall|look up|history)\b/i.test(context.currentMessage));
  const clarification = conversationOnly ? null : !petIds.length ? "subject" : readOperation === "clarify" ? "reference" : null;
  let selection = (p.selection ?? (p.from ? "period" : readOperation === "status" ? "latest" : readOperation === "comparison" ? "comparison" : readOperation === "episode" ? "reference" : "summary")) as typeof selections[number];
  // Selection is a model-proposed read strategy, not source identity. A missing
  // range cannot authorize a particular note, but need not fail an otherwise
  // validated lookup. Retain all ownership/date/ordinal checks and read budgets.
  if (!p.from && (selection === "period" || selection === "reference" && readOperation !== "episode")) {
    selection = readOperation === "status" ? "latest" : readOperation === "comparison" ? "comparison" : "summary";
  }
  const historical = !!readOperation && ["overview", "recall", "comparison", "status", "count"].includes(readOperation);
  const terms = normalizeHistoricalSearchTerms(recoveredTopic ? [recoveredTopic] : p.terms as string[], context.currentMessage);
  const medicationReferent = readOperation === "recall" && !clarification ? medicationReferencePet(context) : null;
  const referenceSubject = medicationReferent && petIds.length === 1
    && owned.find(pet => pet.id === petIds[0])?.name === medicationReferent.name
    ? { kind: "medication" as const, petId: petIds[0],
      attribute: /\bdose\b/i.test(context.currentMessage) ? "dose" as const : "name" as const } : undefined;
  const reference = datedNoteReformulation(context);
  const referenceQuestion = reference && readOperation === "recall" && !clarification && petIds.length === 1
    && petIds[0] === reference.petId && p.from === reference.day && p.to === reference.after ? reference.question : undefined;
  return { version: "ask-interpretation.v1", operation, readOperation, selection, petIds, topic: p.topic,
    ...(referenceQuestion ? { referenceQuestion } : {}),
    ...(referenceSubject ? { referenceSubject } : {}), ...(conversationOnly ? { conversationOnly: true } : {}), readOnly: conversationOnly || !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion, clarification, frame: frameValidation.frame,
    episodeTopic: p.episodeTopic as AskInterpretation["episodeTopic"], ordinal: p.ordinal as AskInterpretation["ordinal"],
    history: historical && !clarification ? { terms, from: p.from ? `${p.from}T00:00:00.000Z` : null,
      to: p.to ? `${p.to}T00:00:00.000Z` : null, interpretation: terms.length ? "lexical" : p.from ? "period" : "broad_comparison" } : null };
}

export function recoverAskInterpretation(value: unknown, context: InterpretationContext): AskInterpretation {
  if (value && typeof value === "object" && "version" in value && value.version === ASK_REQUEST_VERSION) {
    try { return validateAskRequest(value, context); }
    catch (error) {
      const reason = error instanceof Error ? /^ASK_REQUEST_INVALID:([a-z_]+)$/.exec(error.message)?.[1] : null;
      throw new AskInterpretationValidationError(reason ? `ASK_REQUEST_CONTRACT_${reason.toUpperCase()}` : "ASK_REQUEST_CONTRACT", "semantic");
    }
  }
  try { return validateAskInterpretation(normalizeAskReadProposal(value, context), context); }
  catch (error) {
    if (error instanceof AskInterpretationValidationError) {
      const completeProposal = value && typeof value === "object" && askInterpretationSchema.required.every(key => key in value);
      if (["ASK_INTERPRETATION_READ_OPERATION", "ASK_INTERPRETATION_UPDATE_INTENT", "ASK_INTERPRETATION_SUBJECT"].includes(error.reason)
        || error.reason === "ASK_INTERPRETATION_SCHEMA" && completeProposal) return unavailableAskReadPlan(error.reason);
    }
    throw error;
  }
}

export async function interpretAskQuestion({ context, model, client, onProviderEvent }: {
  context: InterpretationContext; model: string;
  onProviderEvent?: (event: AskProviderEvent) => void;
  client?: { responses: { create: (request: Record<string, unknown>, options?: { signal: AbortSignal }) => Promise<Record<string, unknown>> } };
}): Promise<AskInterpretation> {
  const state = buildRecentSubjectState({ pets: context.eligiblePets.filter(pet => pet.user_id === context.owner.userId), selectedPetId: context.pet.id, recentConversation: context.conversationTurns });
  const input = { conversationSubject: state.entities.find(entity => entity.key === state.currentFocusKey)?.label || null, currentMessage: context.currentMessage, today: new Date().toISOString().slice(0, 10),
    selectedPet: context.pet.name,
    reformulation: /\b(?:last|previous|that)\s+(?:answer|response)\b/i.test(context.currentMessage)
      && /\b(?:briefly|shorter|shorten|rephrase|explain|translate)\b/i.test(context.currentMessage)
      ? { task: "Re-answer this user question using newly retrieved evidence, applying the current format request",
        priorUserQuestion: context.conversationTurns.filter(turn => turn.role === "user" && turn.text !== context.currentMessage).at(-1)?.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars) || null }
      : null,
    ownedPets: context.eligiblePets.filter(pet => pet.user_id === context.owner.userId).map(pet => ({ name: pet.name, species: pet.species })),
    recentUserMessages: context.conversationTurns.filter(turn => turn.role === "user").slice(-ASK_INTERPRETATION_LIMITS.turns).map(turn => turn.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars)),
    // Assistant wording can identify a referent, never establish a saved fact,
    // an owned identity, or authority for a write. All reads are re-executed.
    recentDialogueForReferencesOnly: context.conversationTurns.slice(-ASK_INTERPRETATION_LIMITS.turns)
      .map(turn => ({ id: turn.id, role: turn.role, text: turn.text.slice(0, ASK_INTERPRETATION_LIMITS.turnChars) })) };
  const request = { model, max_output_tokens: ASK_INTERPRETATION_LIMITS.outputTokens,
    ...(/^gpt-5(?:\.|-|$)/i.test(model) ? { reasoning: { effort: "medium" } } : {}),
    instructions: ASK_REQUEST_INSTRUCTIONS, input: JSON.stringify(input), text: { format: { type: "json_schema", name: "furvise_ask_interpretation", strict: true, schema: askRequestSchema(proposedSemanticFrameJsonSchema) } } };
  const started = Date.now();
  let attempted = false;
  let providerSignal: AbortSignal | undefined;
  const fail = (reason: string, kind: string, extras: Partial<AskProviderEvent> = {}) => new AskPipelineError("interpretation_failed",
    "I couldn't understand the request reliably this time. Please try again.",
    { model, elapsedMs: Date.now() - started, providerErrorCode: reason, providerErrorType: kind, ...extras });
  try {
    const activeClient = client || new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }) as unknown as NonNullable<typeof client>;
    const response = await executeAdmittedProviderCall({ model, maxOutputTokens: ASK_INTERPRETATION_LIMITS.outputTokens,
      providerInput: { input: request.input, instructions: request.instructions },
      invoke: () => {
        attempted = true;
        onProviderEvent?.({ stage: "interpretation", outcome: "started", model, elapsedMs: 0, configuredOutputLimit: ASK_INTERPRETATION_LIMITS.outputTokens });
        providerSignal = AbortSignal.timeout(boundedProviderTimeout(ASK_INTERPRETATION_LIMITS.timeoutMs));
        return activeClient.responses.create(request as never, { signal: providerSignal });
      } });
    // Parse transport/JSON separately from server validation. Never surface or
    // log the parser's raw error message, response text, refusal or field values.
    const result = interpretStructuredProviderResponse(response, raw => JSON.parse(raw) as unknown);
    const metadata = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      parsingAttempted: result.parsingAttempted, configuredOutputLimit: ASK_INTERPRETATION_LIMITS.outputTokens };
    if (result.status !== "completed") {
      const kind = result.status === "invalid" ? result.parsingAttempted ? "json" : "empty_output" : result.status;
      throw fail(`ASK_INTERPRETATION_${kind.toUpperCase()}`, kind, metadata);
    }
    let parsed: AskInterpretation;
    try { parsed = recoverAskInterpretation(result.parsed, context); }
    catch (error) {
      if (error instanceof AskInterpretationValidationError) throw fail(error.reason, error.category, metadata);
      throw fail("ASK_INTERPRETATION_VALIDATION", "semantic", metadata);
    }
    onProviderEvent?.({ stage: "interpretation", outcome: "succeeded", model, elapsedMs: Date.now() - started, ...metadata });
    return parsed;
  } catch (error) {
    if (error instanceof AiAdmissionError) {
      if (attempted) onProviderEvent?.({ stage: "interpretation", outcome: "failed", model, elapsedMs: Date.now() - started, providerErrorCode: "ASK_INTERPRETATION_ADMISSION" });
      throw error; // preserve admission budgets and settlement classification
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
  return {
    usedProviderExtraction: true,
    resolution: {
      status: interpretation.conversationOnly ? "resolved" as const : interpretation.petIds.length > 1 ? "multi_subject" as const : interpretation.petIds.length ? "resolved" as const : "ambiguous" as const,
      petId: interpretation.petIds[0] || (interpretation.conversationOnly ? selectedPetId : null),
      petIds: interpretation.petIds,
      reasonCode: null,
      requiresClarification: interpretation.clarification === "subject",
      explicitSubject: !interpretation.conversationOnly,
      confidence: 1,
    },
  };
}
