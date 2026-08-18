import OpenAI from "openai";
import { AiAdmissionError } from "./usage-guard/errors.ts";
import { executeAdmittedProviderCall } from "./usage-guard/provider-call-budget.ts";
import type { CareEntryRow, DogMemoryRow, DogProductFeedbackRow, DogProfileRow } from "../supabase.ts";
import { FURVISE_SHARED_PROMPT_RULES } from "../furvise-voice.ts";
import {
  evaluateAskSafetyContext,
  concernKeyToAskTags,
  formatConcernTag,
  getPetReferenceGuidance,
  isHistoricalSafetyRelevantToTurn,
  removeUnsupportedGenderedPronouns,
  type RecentAskUpdate,
} from "../ask-safety-context.ts";
import type { PetConcern } from "./concern-engine.ts";
import type { CareEpisode } from "../intelligence/episodes/types.ts";
import type { ActiveConcernMessageState } from "./turn-classifier.ts";
import { OPENAI_ANALYSIS_MODEL } from "./config.ts";
import {
  ASK_MAX_OUTPUT_TOKENS,
  interpretStructuredProviderResponse,
  type OpenAiStructuredResponseLike,
} from "./ask-provider.ts";
export { ASK_MAX_OUTPUT_TOKENS } from "./ask-provider.ts";
import {
  intelligenceCareActionJsonSchema,
  canonicalEventProposalJsonSchema,
  intelligenceLearningJsonSchema,
  isIntelligenceCareAction,
  isIntelligenceLearning,
  isCanonicalEventProposal,
  isMessageUnderstanding,
  messageUnderstandingJsonSchema,
} from "../intelligence/schemas.ts";
import type { CanonicalEventProposal, IntelligenceCareAction, IntelligenceLearning, IntelligenceMessageUnderstanding, IntelligenceSafetyLevel } from "../intelligence/types.ts";
import { emptyProposedSemanticFrame, validateProposedSemanticFrame } from "../intelligence/semantic-frame/extract-frame.ts";
import { proposedSemanticFrameJsonSchema } from "../intelligence/semantic-frame/schema.ts";
import type { ProposedSemanticFrame } from "../intelligence/semantic-frame/types.ts";
import {
  recoverOwnerPreferenceFrame,
  type OwnerPreferenceRecoveryContext,
  type SemanticFrameRecoveryTelemetry,
} from "../intelligence/semantic-frame/recover-owner-preference.ts";
import { terminalOutcomeSupportedBySurface } from "../intelligence/recovery-governance.ts";
import { modelApplicationActionJsonSchema, parseModelApplicationActions, type ModelApplicationAction } from "../application-actions/index.ts";

export type AskContextSourceType =
  | "profile"
  | "active_concern"
  | "active_episode"
  | "resolved_episode"
  | "care_update"
  | "remembered_detail"
  | "conversation_turn"
  | "product_context";

export type AskContextRecord = {
  id: string;
  sourceType: AskContextSourceType;
  petId: string;
  petName: string;
  kind: string;
  value: string;
  occurredAt: string | null;
  createdAt: string | null;
  status: "active" | "possibly_active" | "resolved" | "unknown" | null;
  priority: "routine" | "important" | "urgent" | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type AskResponseMode =
  | "conversational"
  | "practical_guidance"
  | "urgent_safety"
  | "grief_support"
  | "clarification"
  | "vet_preparation";

export type ProposedHistoryUpdate = {
  shouldOffer: boolean;
  category: string | null;
  title: string | null;
  details: string | null;
  severity: string | null;
  resolvesConcernId: string | null;
};

export type AskReasoningResult = {
  answer: {
    title: string;
    summary: string;
    sections: { heading: string; items: string[] }[];
    safetyNote: string | null;
  };
  userIntent: string;
  relevantContextIds: string[];
  referencedRecords: AskContextRecord[];
  safetyLevel: "normal" | "monitor" | "urgent";
  shoppingSuppressed: boolean;
  suggestedFollowUps: string[];
  applicationActions: ModelApplicationAction[];
  proposedHistoryUpdate: ProposedHistoryUpdate;
  responseMode: AskResponseMode;
  model: string;
  messageUnderstanding: IntelligenceMessageUnderstanding;
  intelligenceSafety: {
    level: IntelligenceSafetyLevel;
    reason: string;
    requiresImmediateAction: boolean;
    shoppingSuppressed: boolean;
  };
  learnings: IntelligenceLearning[];
  careActions: IntelligenceCareAction[];
  semanticEvents: CanonicalEventProposal[];
  /** Diagnostic-only Phase 1 output. It never authorizes production persistence. */
  semanticFrame: ProposedSemanticFrame;
  semanticFrameValid: boolean;
  semanticFrameRecovery: SemanticFrameRecoveryTelemetry;
  intelligenceMetadata: {
    confidence: "low" | "medium" | "high";
    usedPetContext: boolean;
    usedCareHistory: boolean;
    usedMemories: boolean;
  };
};

type ConversationTurn = {
  id: string;
  role: "user" | "furvise";
  text: string;
  createdAt?: string | null;
};

type BuildContextInput = {
  profiles: DogProfileRow[];
  careEntries: CareEntryRow[];
  memories: DogMemoryRow[];
  productFeedback: DogProductFeedbackRow[];
  conversationTurns: ConversationTurn[];
  recentUpdates: RecentAskUpdate[];
  concerns?: PetConcern[];
  recentlyResolvedConcerns?: PetConcern[];
  activeEpisodes?: CareEpisode[];
  recentlyResolvedEpisodes?: CareEpisode[];
  question: string;
  requestId: string;
  locale?: string;
  concernStateHint?: ActiveConcernMessageState;
  turnSemanticFrame?: ProposedSemanticFrame;
  now?: Date;
};

export type GenerateAskReasoningInput = BuildContextInput & {
  apiKey?: string;
  client?: AskReasoningOpenAiClient;
  locale: string;
  onProviderEvent?: (event: AskProviderEvent) => void;
  semanticFrameRecovery?: Omit<OwnerPreferenceRecoveryContext, "sourceMessage" | "safetyLevel">;
};

type AskReasoningOpenAiClient = {
  responses: {
    create(request: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<OpenAiStructuredResponseLike>;
  };
};

export type AskPipelineFailureStage =
  | "configuration_failed"
  | "primary_provider_failed"
  | "primary_timeout"
  | "primary_invalid_output"
  | "fallback_provider_failed"
  | "fallback_timeout"
  | "fallback_invalid_output";

export type AskProviderEvent = {
  stage: "configuration" | "primary" | "fallback" | "repair";
  outcome: "started" | "succeeded" | "failed";
  model: string;
  elapsedMs: number;
  providerStatus?: number | null;
  providerErrorType?: string;
  providerErrorCode?: string;
  timedOut?: boolean;
  validationDetails?: string;
  fallbackFrom?: string;
  fallbackEligible?: boolean;
  retryAfterMs?: number;
  configuredOutputLimit?: number;
  finishReason?: string | null;
  incompleteReason?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  outputLimitReached?: boolean;
  parsingAttempted?: boolean;
  rawOutputLength?: number;
};

export class AskPipelineError extends Error {
  stage: AskPipelineFailureStage;
  diagnostics: Omit<AskProviderEvent, "outcome" | "stage">;

  constructor(stage: AskPipelineFailureStage, message: string, diagnostics: Omit<AskProviderEvent, "outcome" | "stage">) {
    super(message);
    this.name = "AskPipelineError";
    this.stage = stage;
    this.diagnostics = diagnostics;
  }
}

const responseModes = ["conversational", "practical_guidance", "urgent_safety", "grief_support", "clarification", "vet_preparation"] as const;
const safetyLevels = ["normal", "monitor", "urgent"] as const;
export const ASK_PROMPT_CONTEXT_CHAR_BUDGET = 48_000;
const providerCooldowns = new Map<string, number>();
const askLearningJsonSchema = {
  ...intelligenceLearningJsonSchema,
  properties: {
    ...intelligenceLearningJsonSchema.properties,
    sourceExcerpt: { type: "string", maxLength: 160 },
  },
} as const;
const askCareActionJsonSchema = {
  ...intelligenceCareActionJsonSchema,
  properties: {
    ...intelligenceCareActionJsonSchema.properties,
    details: { type: "string", maxLength: 500 },
  },
} as const;

export const askUnifiedJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "answer", "answerSections", "safetyLevel", "suggestedFollowUps", "applicationActions", "proposedHistoryUpdate",
    "responseMode", "userIntent", "relevantContextIds",
    "messageUnderstanding", "intelligenceSafety", "learnings", "careActions", "semanticEvents", "semanticFrame",
  ],
  properties: {
    answer: { type: "string", minLength: 1, maxLength: 1800 },
    answerSections: {
      type: "array", maxItems: 3, items: {
        type: "object", additionalProperties: false, required: ["heading", "items"],
        properties: {
          heading: { type: "string", minLength: 1, maxLength: 80 },
          items: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 260 } },
        },
      },
    },
    safetyLevel: { type: "string", enum: [...safetyLevels] },
    suggestedFollowUps: { type: "array", maxItems: 4, items: { type: "string", maxLength: 180 } },
    applicationActions: { type: "array", maxItems: 3, items: modelApplicationActionJsonSchema },
    proposedHistoryUpdate: {
      type: "object",
      additionalProperties: false,
      required: ["shouldOffer", "category", "title", "details", "severity", "resolvesConcernId"],
      properties: {
        shouldOffer: { type: "boolean" },
        category: { anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }] },
        title: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
        details: { anyOf: [{ type: "string", maxLength: 400 }, { type: "null" }] },
        severity: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
        resolvesConcernId: { anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }] },
      },
    },
    responseMode: { type: "string", enum: [...responseModes] },
    userIntent: { type: "string", maxLength: 120 },
    relevantContextIds: { type: "array", maxItems: 8, items: { type: "string", maxLength: 160 } },
    messageUnderstanding: messageUnderstandingJsonSchema,
    intelligenceSafety: {
      type: "object", additionalProperties: false,
      required: ["level", "reason", "requiresImmediateAction"],
      properties: {
        level: { type: "string", enum: ["routine", "monitor", "urgent", "emergency", "recently_resolved"] },
        reason: { type: "string", maxLength: 220 }, requiresImmediateAction: { type: "boolean" },
      },
    },
    learnings: { type: "array", maxItems: 5, items: askLearningJsonSchema },
    careActions: { type: "array", maxItems: 3, items: askCareActionJsonSchema },
    semanticEvents: { type: "array", maxItems: 4, items: canonicalEventProposalJsonSchema },
    semanticFrame: proposedSemanticFrameJsonSchema,
  },
} as const;

const unifiedInstructions = [
  "You are Furvise, a calm, attentive pet-care companion. Return only strict JSON matching the supplied schema.",
  ...FURVISE_SHARED_PROMPT_RULES,
  "Interpret the message, prioritize safety, select relevant supplied context, and write the final conversational answer in this single response.",
  "The server has already loaded and ranked current facts. Do not rediscover or invent database facts.",
  "Canonical active memories override older conversation statements. Conversation records show what was said, not what is currently true. Never revive a rejected, forgotten, expired, or superseded preference from an older turn; the current user message may explicitly provide a new fact.",
  "The deterministic minimum safety level can be raised but never lowered. When it is urgent, lead with the action and suppress shopping.",
  "A recent unresolved concern may outrank a lower-priority question. Resolved or unrelated history must not hijack the answer.",
  "If the user reports that a prior concern improved, acknowledge it without repeating a full emergency warning unless red flags remain. Ask at most one concise confirmation when needed.",
  "Use activeConcernMessageState as a deterministic hint. Improved or resolved means continue conversationally and offer a saved improvement; still_active, worsening, or recurrence means address current safety first; unclear means interpret the newest message in context.",
  "Classify the newest currentMessage before using prior-turn or recently-resolved context. An explicit current report that a condition is present is current/active or recurrent evidence and must outrank an older recovery; never carry recoveryStatus forward from a prior turn.",
  "Set messageUnderstanding.recoveryStatus by meaning, not keywords. Use partial only when the condition remains present but is reduced or getting better. Use terminal only when the owner explicitly reports return to the pet's normal baseline, absence of the prior symptom, or that the problem ended. Use uncertain when the extent is unclear, and none when no recovery is reported. Set recoveryConfidence from the current message and supplied compatible lifecycle context. Independently extract recoveryEvidence: choose return_to_baseline, symptom_absent, or problem_ended only for terminal semantics; partial_improvement when the problem remains; uncertain when hedged or unclear; otherwise none. recoveryEvidence.surfaceText must be one exact contiguous fragment from the current message that supports that outcome, or null for none. Set targetConcept to the specific prior problem the evidence changes, using the supplied active episode topic when compatible, or null when no specific problem is supported. Its confidence must describe only that evidence.",
  "Use saved sex or pronouns only when explicitly supplied. Otherwise use the pet's name, your dog or cat, or neutral they wording.",
  "Put the immediate direct answer in answer. For a Level 3 response, put only genuinely useful grouped actions or monitoring points in answerSections; otherwise return an empty answerSections array. Do not duplicate the direct answer in the sections.",
  "Never diagnose. Do not repeat a generic veterinary disclaimer in routine answers.",
  "For clearly casual small talk, mirror mild slang naturally, keep the answer short, and allow a light joke or an occasional single emoji when it fits. Do not invent monitoring, logging, care-plan, or veterinary advice when the content does not warrant it.",
  "For urgent medical signs, serious injury, poisoning, severe pain, grief, death, or significant distress, immediately suppress jokes, slang, emojis, and playful framing. Safety remains dominant.",
  "Use responseMode=grief_support for a reported death, grief, or a loss-context follow-up. Death is not an urgent-treatment mode for the deceased pet. Keep grief responses compassionate and concise, suppress routine monitoring, product, and future-vet assumptions, and return no generic follow-ups.",
  "When the user asks Furvise to read, change, remove, prepare, or open application state, emit a typed applicationActions proposal instead of pretending the operation happened. Copy one exact current-message fragment into evidence. Set explicitIntent true only when the user directly requested that operation. Never invent identifiers. The server owns authorization, confirmation, execution, and success copy.",
  "Application action inputs are semantic, not database-shaped. For pet.update_profile use field=name, weight, current_food, routine_note, sex, or breed and preserve the explicit value. For care-history actions write a standalone title and detail, and use target=last only when the owner clearly refers to the latest entry. Use navigation.open_pet_profile, navigation.open_memories, navigation.open_care_history, navigation.open_vet_brief, or vet_brief.prepare for navigation and preparation requests.",
  "Use memory.set_preference for singleton USER communication preferences. Normalize language to field=preferred_language, units to preferred_units, and communication style to communication_style. A newer singleton value replaces the older value. Never store these as pet facts. Use memory.forget_preference only for an explicit request to forget one of those fields.",
  "When one message replaces an old singleton preference with a new value, emit only memory.set_preference for the new value. Do not also emit memory.forget_preference for the same field because replacement supersedes the old value atomically.",
  "Use pet.mark_deceased for a confidently reported death, but it always requires application confirmation. If death is uncertain, do not propose it. Never convert death into pet deletion. Use pet.delete_permanently only when the user explicitly requests deletion. Use navigation actions for requests to open a Furvise page.",
  "Use pet.mark_active with confirmation when the owner explicitly corrects a previously recorded death or archive state. Do not infer reactivation from merely discussing a deceased pet in the past tense.",
  "When supplied profile lifecycle_status is deceased, suppress routine care suggestions, product recommendations, reminders, and assumptions about a future vet visit. Continue supporting history review, retrospective summaries, grief conversation, memorial/archive choices, and explicit deletion. Archived profiles are historical unless the owner explicitly reactivates them elsewhere.",
  "Derive pet characterizations from supplied concrete observations. Mark personality language as an inference and avoid generic flattering labels such as sweet, low-drama, perfect, or good unless the owner supplied them.",
  "A proposedHistoryUpdate is only an offer. Never write authoritative persistence claims such as I saved that, I added that to history, I updated the profile, or I marked it resolved. The server renders confirmation only after its transaction. Use proposedHistoryUpdate only for future-care-relevant symptoms, sustained changes, treatment outcomes, exposures, veterinary events, or tracked improvement. Do not propose jokes, opinions, normal play, one-off cute behavior, or ordinary questions.",
  "Classify multiple simultaneous intents in messageUnderstanding. Extract only facts explicitly stated by the user in learnings, with a verbatim short sourceExcerpt from the current message.",
  "Use careActions only for explicit, useful time-bound care changes. Confidence must reflect the evidence. Never propose a diagnosis or an inferred medication dosage.",
  "Interpret meaningful statements into semanticEvents. Keep topic concise, normalized, and extensible rather than choosing from a fixed topic catalogue. Use the same topic as a supplied active episode when the message continues, improves, worsens, or resolves it. Keep eventTitle separate: write a short natural History title such as Luna was found, Started medication, Food changed, or Vaccination; never expose topic keys, underscores, or duplicated transition words in eventTitle.",
  "Emit semanticEvents only for occurrences with future care value: new or changing symptoms, sustained behavior or routine changes, appetite/drinking/elimination changes, medication or treatment changes and outcomes, weight or diet changes, clinically relevant exposures, injuries, veterinary visits/results, recurring concerns, and tracked improvement/worsening/resolution. Do not emit them for jokes, opinions, greetings, generic questions, normal play, chasing butterflies, or irrelevant outside-animal facts. An explicit owner command to save or log something overrides this normal threshold. Chronology and memory are independent destinations. Use state=historical for a completed standalone event; use active or monitoring only when it creates or changes an ongoing temporary state.",
  "Classify preventive procedures and completed care services as domain=care rather than as a health symptom. Preserve the user's temporal wording in temporal.explicitTime, and set temporal.occurredAt only when the occurrence timestamp is supported by the supplied request context.",
  "Semantic fields are independent: urgency is safety, not a topic. A safety event is not respiratory unless the message or supplied current context explicitly concerns breathing.",
  "Do not emit database IDs in semanticEvents. The server resolves owned episode references. A resolution without a compatible supplied active episode must be treated as ambiguous and must not fabricate prior state.",
  "When recoveryStatus is terminal with high confidence and the current message contains no worsening, recurrence, or emergency evidence, represent a compatible active episode as transition=resolved and state=resolved. Partial recovery remains transition=improved and state=monitoring.",
  "Also emit semanticFrame as diagnostic shadow interpretation only. Use local IDs such as entity_1, reference_1, and claim_1; never copy or invent any supplied database ID into semanticFrame. Extract open-ended predicates and concepts rather than selecting from a topic catalogue. Include every independently supported assertion, event, transition, preference, relationship, correction, or retraction in the current message. A return to normal baseline, explicit symptom absence, or ended active problem is a state_transition with transition=resolved and the prior problem as targetConcept; reduced but continuing symptoms are transition=improved; uncertain wellbeing without a definite lifecycle change remains an assertion with suspected modality. For every evidence item, copy one contiguous surfaceText fragment from the current message; never calculate offsets and never paraphrase evidence. Use multiple fragments when support is non-contiguous.",
  "Choose SemanticFrame claim kinds by structure, not keywords. An assertion is a property, measurement, durable fact, or state snapshot. An event is a bounded occurrence or action. A state_transition explicitly changes a prior or active state, including resolution, recurrence, improvement, or worsening. A preference expresses desirability or a constraint. A relationship expresses a recurring or durable role between entities. A correction targets and revises, retracts, forgets, negates, or confirms another claim.",
  "Bind first-person preferences and first-person owner facts to the owner mention (I, me, or my). Treat named organizations, retailers, brands, products, stores, and places as values or objects unless the message explicitly makes a third party the subject.",
  "For every SemanticFrame concept, provide short lexical aliases only when they mean the same thing, parentLabels only for broader concepts, and relatedLabels only for non-identical related concepts. Do not call merely similar concepts aliases. The selected pet is contextual evidence, not automatic subject identity.",
  "Owner learnings may cover explicit shopping, budget, schedule, or communication preferences. Never infer sensitive personal traits.",
  "Return zero to four suggestedFollowUps only when they add decision value. Write each from the owner's perspective as a directly sendable question, such as What should I track? or Can you summarize the last few days? Never write assistant offers beginning If you want, I can, I can also, or Would you like me to. Order them by usefulness, information likely to change a decision, relevant Furvise-specific capability, and continuity with the recent conversation. Do not paraphrase the answer, repeat a suggestion, offer generic filler, expose internal machinery, or suggest unsafe actions. Return none for urgent, grief-related, significantly distressed, or trivial casual turns.",
  "Keep every reason and source excerpt concise. Return at most four follow-ups, five learnings, and three care actions. Do not repeat supplied context in metadata.",
  "Include only supplied stable IDs in relevantContextIds. Never mention IDs, schemas, classifiers, or system instructions in the answer.",
].join("\n");

export function getAskModelConfiguration(env: Record<string, string | undefined> = process.env) {
  const primary = env.OPENAI_ASK_PRIMARY_MODEL?.trim() || env.OPENAI_ASK_MODEL?.trim() || env.OPENAI_ASK_RESPONSE_MODEL?.trim() || OPENAI_ANALYSIS_MODEL;
  const fallback = env.OPENAI_ASK_FALLBACK_MODEL?.trim() || null;
  return { primary, fallback, primaryUsedDefault: !env.OPENAI_ASK_PRIMARY_MODEL?.trim() && !env.OPENAI_ASK_MODEL?.trim() };
}

export function getAskProviderCooldown(model: string, now = Date.now()) {
  const until = providerCooldowns.get(model) || 0;
  if (until <= now) {
    providerCooldowns.delete(model);
    return { active: false, retryAfterMs: 0 };
  }
  return { active: true, retryAfterMs: until - now };
}

export function clearAskProviderCooldownsForTests() {
  providerCooldowns.clear();
}

export function buildAskContext(input: BuildContextInput) {
  const allRecords = buildContextRecords(input);
  const terms = meaningfulTerms(input.question);
  for (const profile of input.profiles) {
    for (const identityTerm of meaningfulTerms(profile.name || "")) terms.delete(identityTerm);
  }
  const historicalSafetyRelevant = isHistoricalSafetyRelevantToTurn({
    activeConcerns: input.concerns || [],
    concernStateHint: input.concernStateHint,
    currentMessage: input.question,
    frame: input.turnSemanticFrame,
  });
  const now = (input.now || new Date()).getTime();
  const scored = allRecords
    .map((record) => ({ record, score: scoreRecord(record, terms, now) }))
    .sort((left, right) => right.score - left.score || timestamp(right.record) - timestamp(left.record) || left.record.id.localeCompare(right.record.id));

  const profile = scored.filter(({ record }) => record.sourceType === "profile");
  const activeConcerns = historicalSafetyRelevant
    ? scored.filter(({ record }) => record.sourceType === "active_concern" && record.status !== "resolved").slice(0, 3)
    : [];
  const resolvedConcerns = scored.filter(({ record }) => record.sourceType === "active_concern" && record.status === "resolved").slice(0, 3);
  const activeEpisodes = historicalSafetyRelevant
    ? scored.filter(({ record }) => record.sourceType === "active_episode").slice(0, 6)
    : [];
  const resolvedEpisodes = scored.filter(({ record }) => record.sourceType === "resolved_episode" && recordMatchesTerms(record, terms)).slice(0, 3);
  const relevantUpdates = chooseUpdates(scored.filter(({ record }) => record.sourceType === "care_update"
    && (historicalSafetyRelevant || record.status === "resolved" || record.priority === "routine" || recordMatchesTerms(record, terms))));
  const memories = scored.filter(({ record }) => record.sourceType === "remembered_detail").slice(0, 8);
  const conversation = scored
    .filter(({ record }) => record.sourceType === "conversation_turn")
    .sort((left, right) => timestamp(left.record) - timestamp(right.record))
    .slice(-6);
  const product = /\b(product|food|brand|buy|shop|recommend)\b/i.test(input.question)
    ? scored.filter(({ record }) => record.sourceType === "product_context").slice(0, 3)
    : [];
  const chosen = dedupeScored([...activeConcerns, ...activeEpisodes, ...resolvedConcerns, ...resolvedEpisodes, ...profile, ...relevantUpdates, ...memories, ...conversation, ...product]);
  let detailedUpdateCount = 0;
  const records = chosen.map(({ record }) => {
    const fullDetail = record.sourceType === "care_update" && detailedUpdateCount < 2;
    if (fullDetail) detailedUpdateCount += 1;
    return compactRecord(record, fullDetail);
  });
  const chosenUpdateIds = new Set(relevantUpdates.map(({ record }) => record.id));
  const omittedUpdates = scored.filter(({ record }) => record.sourceType === "care_update" && !chosenUpdateIds.has(record.id));
  const updateSummary = omittedUpdates.length
    ? `${omittedUpdates.length} older update${omittedUpdates.length === 1 ? "" : "s"}: ${[...new Set(omittedUpdates.map(({ record }) => record.kind))].slice(0, 5).join(", ")}.`
    : null;

  const recentTurns = input.conversationTurns.slice(-6).map((turn) => ({ role: turn.role, text: clean(turn.text).slice(0, 500) }));
  const safety = evaluateAskSafetyContext({
    activeCareNotes: historicalSafetyRelevant ? input.memories.map((memory) => memory.text) : [],
    authoritativeActiveConcernTags: historicalSafetyRelevant
      ? (input.concerns || []).flatMap((concern) => concernKeyToAskTags(concern.normalized_key, concern.title))
      : [],
    currentMessage: input.question,
    recentConversationTurns: recentTurns,
    recentlyResolvedConcernTags: !historicalSafetyRelevant || input.concernStateHint === "unrelated"
      ? []
      : (input.recentlyResolvedConcerns || []).flatMap((concern) => concernKeyToAskTags(concern.normalized_key, concern.title)),
    recentUpdates: input.recentUpdates,
  });
  const hasUrgentConcern = historicalSafetyRelevant
    && (input.concerns || []).some((concern) => concern.status !== "resolved" && concern.severity === "urgent");
  const reportedImprovement = input.concernStateHint === "improved" || input.concernStateHint === "resolved";
  const minimumSafetyLevel = reportedImprovement
    ? "monitor"
    : hasUrgentConcern || safety.safetyLevel === "urgent"
      ? "urgent"
      : safety.safetyLevel === "monitor" ? "monitor" : "normal";
  const petReferences = input.profiles.map((pet) => ({
    id: pet.id,
    name: pet.name,
    species: pet.species,
    referenceGuidance: getPetReferenceGuidance({
      name: pet.name || "your pet",
      species: pet.species,
      pronouns: readOptionalString(pet, "pronouns"),
      sex: readOptionalString(pet, "sex") || readOptionalString(pet, "gender"),
    }).instruction,
  }));

  const promptContext = enforceAskPromptContextBudget({
      currentMessage: clean(input.question).slice(0, 1200),
      currentTimestamp: (input.now || new Date()).toISOString(),
      locale: input.locale || "en",
      minimumSafetyLevel,
      activeConcernMessageState: input.concernStateHint || "unclear",
      historicalSafetyRelevant,
      activeConcernTags: safety.activeConcernTags,
      recentlyResolvedConcerns: (input.recentlyResolvedConcerns || []).slice(0, 3).map((concern) => ({
        id: concern.id,
        type: concern.normalized_key,
        resolvedAt: concern.resolved_at,
        ownerReport: concern.resolution_note,
      })),
      pets: petReferences,
      contextRecords: records,
      olderUpdateSummary: updateSummary,
  });
  return {
    records: promptContext.contextRecords,
    promptContext,
    minimumSafetyLevel,
  };
}

function enforceAskPromptContextBudget<T extends { contextRecords: AskContextRecord[] }>(promptContext: T): T {
  const contextRecords = [...promptContext.contextRecords];
  const budgeted = { ...promptContext, contextRecords };
  while (contextRecords.length && JSON.stringify(budgeted).length > ASK_PROMPT_CONTEXT_CHAR_BUDGET) contextRecords.pop();
  return budgeted;
}

export function buildRankedAskContext(input: BuildContextInput) {
  return buildAskContext(input).records;
}

export async function generateContextAwareAskResponse(input: GenerateAskReasoningInput): Promise<AskReasoningResult> {
  const client = input.client || createClient(input.apiKey || process.env.OPENAI_API_KEY);
  const models = getAskModelConfiguration();
  if (!client) {
    throw new AskPipelineError("configuration_failed", "OPENAI_API_KEY is not configured.", { elapsedMs: 0, model: models.primary });
  }
  const context = buildAskContext(input);
  const request = buildProviderRequest(context.promptContext);
  const parseOutput = (rawText: string) => parseUnifiedResponse(rawText, context.records, input.semanticFrameRecovery
    ? {
      ...input.semanticFrameRecovery,
      sourceMessage: input.question,
      safetyLevel: context.minimumSafetyLevel === "normal" ? "routine"
        : context.minimumSafetyLevel === "monitor" ? "caution" : "urgent",
    }
    : undefined, input.question);
  const cooldown = getAskProviderCooldown(models.primary);
  if (cooldown.active) {
    throw new AskPipelineError("primary_provider_failed", "Ask provider is cooling down.", {
      elapsedMs: 0,
      model: models.primary,
      providerErrorCode: "rate_limit_exceeded",
      providerErrorType: "requests",
      providerStatus: 429,
      retryAfterMs: cooldown.retryAfterMs,
    });
  }

  let parsed: ParsedUnifiedResponse;
  let usedModel = models.primary;
  let retryUsed = false;
  try {
    parsed = await runProviderRequest({
      client, model: models.primary, onEvent: input.onProviderEvent, parseOutput, request, stage: "primary", timeoutMs: 25_000,
    });
  } catch (error) {
    if (!(error instanceof AskPipelineError)) throw error;
    if (isRetryableProviderLimit(error) && isRequestRateLimit(error)) {
      setProviderCooldown(models.primary, error.diagnostics.retryAfterMs);
      input.onProviderEvent?.({
        stage: "fallback",
        outcome: "failed",
        model: models.fallback || models.primary,
        elapsedMs: 0,
        fallbackFrom: models.primary,
        fallbackEligible: false,
        providerErrorCode: error.diagnostics.providerErrorCode,
        providerErrorType: error.diagnostics.providerErrorType,
        providerStatus: error.diagnostics.providerStatus,
        retryAfterMs: error.diagnostics.retryAfterMs,
        validationDetails: "Fallback skipped for a requests-based provider rate limit.",
      });
      throw error;
    }
    if (isRetryableProviderLimit(error)) {
      const retryModel = models.fallback;
      const fallbackEligible = Boolean(retryModel && retryModel !== models.primary);
      input.onProviderEvent?.({
        stage: "fallback", outcome: "failed", model: retryModel || models.primary, elapsedMs: 0,
        fallbackFrom: models.primary, fallbackEligible,
        validationDetails: fallbackEligible ? "Fallback eligible." : "Fallback skipped because no distinct model is configured.",
      });
      if (!retryModel || !fallbackEligible) throw error;
      usedModel = retryModel;
      retryUsed = true;
      parsed = await runProviderRequest({
        client, fallbackFrom: models.primary, model: retryModel, onEvent: input.onProviderEvent,
        parseOutput, request, stage: "fallback", timeoutMs: 20_000,
      });
    } else if (isRepairableStructuredOutput(error)) {
      const repairModel = models.fallback && models.fallback !== usedModel ? models.fallback : usedModel;
      retryUsed = true;
      parsed = await runProviderRequest({
        client,
        fallbackFrom: usedModel,
        model: repairModel,
        onEvent: input.onProviderEvent,
        parseOutput,
        request: buildProviderRequest({
          ...context.promptContext,
          repairInstruction: error.diagnostics.providerErrorCode === "ASK_OUTPUT_INCOMPLETE"
            ? "Repeat the original answer as complete concise structured output. Do not expand fields or repeat context."
            : "Return concise complete structured output matching the schema. Do not add commentary.",
        }),
        stage: "repair",
        timeoutMs: 20_000,
      });
      usedModel = repairModel;
    } else {
      throw error;
    }
  }

  if (hasUnsupportedTerminalRecovery(parsed)) {
    if (retryUsed) {
      throw new AskPipelineError("fallback_invalid_output", "Ask provider returned unsupported terminal recovery.", {
        elapsedMs: 0, model: usedModel, providerErrorCode: "ASK_OUTPUT_INVALID",
        validationDetails: "Terminal recovery evidence did not entail baseline restoration, symptom absence, or an ended problem.",
      });
    }
    const repairModel = models.fallback && models.fallback !== usedModel ? models.fallback : usedModel;
    parsed = await runProviderRequest({
      client,
      fallbackFrom: usedModel,
      model: repairModel,
      onEvent: input.onProviderEvent,
      parseOutput,
      request: buildProviderRequest({
        ...context.promptContext,
        recoveryRepairInstruction: "Reclassify the newest currentMessage without inheriting recovery from prior context. A current condition report is not recovery. Terminal recovery requires explicit current-message evidence of baseline restoration, symptom absence, or an ended problem.",
      }),
      stage: "repair",
      timeoutMs: 20_000,
    });
    retryUsed = true;
    usedModel = repairModel;
    if (hasUnsupportedTerminalRecovery(parsed)) {
      throw new AskPipelineError("fallback_invalid_output", "Ask provider repeated unsupported terminal recovery.", {
        elapsedMs: 0, model: usedModel, providerErrorCode: "ASK_OUTPUT_INVALID",
        validationDetails: "Terminal recovery remained unsupported after one bounded current-message repair.",
      });
    }
  }

  const previousAssistantText = [...input.conversationTurns].reverse().find((turn) => turn.role === "furvise")?.text || "";
  if (previousAssistantText && areAskResponsesMateriallyIdentical(parsed.answer, previousAssistantText)) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Ask API] duplicate response detected", { requestId: input.requestId });
    }
    if (retryUsed) {
      throw new AskPipelineError("fallback_invalid_output", "Ask provider repeated the previous answer.", {
        elapsedMs: 0, model: usedModel, providerErrorCode: "ASK_OUTPUT_INVALID", validationDetails: "Duplicate conversational response after a bounded retry.",
      });
    }
    const repairModel = models.fallback && models.fallback !== usedModel ? models.fallback : usedModel;
    parsed = await runProviderRequest({
      client,
      fallbackFrom: usedModel,
      model: repairModel,
      onEvent: input.onProviderEvent,
      parseOutput,
      request: buildProviderRequest({
        ...context.promptContext,
        duplicateResponseWarning: "The draft repeated the previous assistant message. Respond specifically to the newest user message and do not repeat the prior wording.",
      }),
      stage: "repair",
      timeoutMs: 20_000,
    });
    usedModel = repairModel;
    if (areAskResponsesMateriallyIdentical(parsed.answer, previousAssistantText)) {
      throw new AskPipelineError("fallback_invalid_output", "Ask provider repeated the previous answer.", {
        elapsedMs: 0, model: usedModel, validationDetails: "Duplicate conversational response after repair.",
      });
    }
  }

  if (context.minimumSafetyLevel === "urgent") {
    parsed.safetyLevel = "urgent";
    parsed.shoppingSuppressed = true;
    parsed.responseMode = "urgent_safety";
    if (parsed.intelligenceSafety.level !== "emergency") parsed.intelligenceSafety.level = "urgent";
    parsed.intelligenceSafety.shoppingSuppressed = true;
    if (!/\b(vet(?:erinarian)?|emergency|clinic|urgent care)\b/i.test(parsed.answer)) {
      parsed.answer = `Contact an emergency veterinarian now. ${parsed.answer}`.slice(0, 1800);
    }
  }
  if (context.minimumSafetyLevel === "monitor" && parsed.safetyLevel === "normal") {
    parsed.safetyLevel = "monitor";
    if (parsed.intelligenceSafety.level === "routine") parsed.intelligenceSafety.level = "monitor";
  }

  const profile = input.profiles.length === 1 ? input.profiles[0] : null;
  let answerText = parsed.answer;
  if (profile) {
    const reference = getPetReferenceGuidance({
      name: profile.name || "your pet",
      species: profile.species,
      pronouns: readOptionalString(profile, "pronouns"),
      sex: readOptionalString(profile, "sex") || readOptionalString(profile, "gender"),
    });
    if (!reference.allowsGenderedPronouns) answerText = removeUnsupportedGenderedPronouns(answerText, profile.name || "your pet");
  }
  assertNoInternalReasoningLeak(answerText, context.records);
  const petName = profile?.name || "Your pet";
  const title = input.concernStateHint === "improved" || input.concernStateHint === "resolved"
    ? `It sounds like ${petName} is improving`
    : input.concernStateHint === "recurrence"
      ? "A previous concern may have returned"
      : parsed.responseMode === "urgent_safety" ? urgentSemanticTitle(petName, parsed.semanticEvents, input.question, input.concerns || []) : "Furvise";
  return {
    answer: { title, summary: answerText, sections: parsed.answerSections, safetyNote: null },
    userIntent: parsed.userIntent,
    relevantContextIds: parsed.relevantContextIds,
    referencedRecords: parsed.relevantContextIds.map((id) => context.records.find((record) => record.id === id)).filter((record): record is AskContextRecord => Boolean(record)),
    safetyLevel: parsed.safetyLevel,
    shoppingSuppressed: parsed.shoppingSuppressed,
    suggestedFollowUps: parsed.suggestedFollowUps,
    applicationActions: parsed.applicationActions,
    proposedHistoryUpdate: parsed.proposedHistoryUpdate,
    responseMode: parsed.responseMode,
    model: usedModel,
    messageUnderstanding: parsed.messageUnderstanding,
    intelligenceSafety: parsed.intelligenceSafety,
    learnings: parsed.learnings,
    careActions: parsed.careActions,
    semanticEvents: parsed.semanticEvents,
    semanticFrame: parsed.semanticFrame,
    semanticFrameValid: parsed.semanticFrameValid,
    semanticFrameRecovery: parsed.semanticFrameRecovery,
    intelligenceMetadata: parsed.intelligenceMetadata,
  };
}

function hasUnsupportedTerminalRecovery(parsed: ParsedUnifiedResponse) {
  const recovery = parsed.messageUnderstanding;
  if (recovery.recoveryStatus !== "terminal") return false;
  return !terminalOutcomeSupportedBySurface(recovery.recoveryEvidence.outcome, recovery.recoveryEvidence.surfaceText);
}

export function urgentSemanticTitle(petName: string, events: CanonicalEventProposal[], message = "", concerns: PetConcern[] = []) {
  const grounded = events.filter((event) => normalizedEvidence(message).includes(normalizedEvidence(event.sourceExcerpt)));
  const urgent = grounded.find((event) => event.importance === "urgent") || grounded[0];
  const topic = `${urgent?.topic || ""} ${message} ${concerns.filter((concern) => concern.status !== "resolved").map((concern) => concern.normalized_key).join(" ")}`.toLowerCase().replace(/_/g, " ");
  if (/\b(breath|breathing|respiratory)\b/.test(topic)) return `${petName}'s breathing needs urgent attention`;
  if (/\b(toxin|poison|ingestion|exposure)\b/.test(topic)) return `Possible toxin exposure for ${petName}`;
  if (urgent?.domain === "safety" && /\b(missing|lost)\b/.test(topic)) return `Urgent safety guidance for ${petName}`;
  return `Urgent guidance for ${petName}`;
}

function normalizedEvidence(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

export async function generateStructuredFeatureResponse<T>({
  apiKey,
  input,
  instructions,
  maxOutputTokens = 700,
  onProviderEvent,
  parse,
  schema,
  schemaName,
  temperature = 0.2,
}: {
  apiKey?: string;
  input: unknown;
  instructions: string;
  maxOutputTokens?: number;
  onProviderEvent?: (event: AskProviderEvent) => void;
  parse: (value: unknown) => T | null;
  schema: Record<string, unknown>;
  schemaName: string;
  temperature?: number;
}): Promise<T> {
  const client = createClient(apiKey || process.env.OPENAI_API_KEY);
  const models = getAskModelConfiguration();
  if (!client) throw new AskPipelineError("configuration_failed", "OPENAI_API_KEY is not configured.", { elapsedMs: 0, model: models.primary });
  const request = (modelInput: unknown, outputTokens: number) => ({
    temperature,
    max_output_tokens: outputTokens,
    instructions,
    input: JSON.stringify(modelInput),
    text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
  });
  const parseOutput = (text: string) => {
    const parsed = parse(JSON.parse(text));
    if (!parsed) throw new Error(`${schemaName} validation failed.`);
    return parsed;
  };
  const cooldown = getAskProviderCooldown(models.primary);
  if (cooldown.active) {
    throw new AskPipelineError("primary_provider_failed", "AI provider is cooling down.", {
      elapsedMs: 0, model: models.primary, providerErrorCode: "rate_limit_exceeded",
      providerErrorType: "requests", providerStatus: 429, retryAfterMs: cooldown.retryAfterMs,
    });
  }
  let response: T;
  let usedModel = models.primary;
  try {
    response = await runProviderRequest({ client, model: usedModel, onEvent: onProviderEvent, parseOutput, request: request(input, maxOutputTokens), stage: "primary", timeoutMs: 25_000 });
  } catch (error) {
    if (!(error instanceof AskPipelineError) || !isRetryableProviderLimit(error)) throw error;
    if (isRequestRateLimit(error)) {
      setProviderCooldown(models.primary, error.diagnostics.retryAfterMs);
      throw error;
    }
    if (!models.fallback || models.fallback === models.primary) throw error;
    usedModel = models.fallback;
    response = await runProviderRequest({
      client, fallbackFrom: models.primary, model: usedModel, onEvent: onProviderEvent,
      parseOutput, request: request(input, maxOutputTokens), stage: "fallback", timeoutMs: 20_000,
    });
  }
  return response;
}

type ParsedUnifiedResponse = Omit<AskReasoningResult, "answer" | "referencedRecords" | "model"> & {
  answer: string;
  answerSections: AskReasoningResult["answer"]["sections"];
};

export function parseUnifiedResponse(
  outputText: string,
  records: AskContextRecord[],
  recoveryContext?: OwnerPreferenceRecoveryContext,
  sourceMessage = recoveryContext?.sourceMessage || "",
): ParsedUnifiedResponse {
  const value = JSON.parse(outputText) as Partial<ParsedUnifiedResponse>;
  const intelligenceSafety = normalizeIntelligenceSafety(value?.intelligenceSafety);
  if (!value || typeof value.answer !== "string" || !safetyLevels.includes(value.safetyLevel as never) ||
    !responseModes.includes(value.responseMode as never) || !Array.isArray(value.suggestedFollowUps) ||
    !Array.isArray(value.relevantContextIds) || (value.applicationActions !== undefined && !Array.isArray(value.applicationActions)) ||
    typeof value.userIntent !== "string" || !isProposedHistoryUpdate(value.proposedHistoryUpdate) ||
    !isMessageUnderstanding(value.messageUnderstanding) || !intelligenceSafety ||
    !Array.isArray(value.learnings) || !value.learnings.every(isIntelligenceLearning) ||
    !Array.isArray(value.careActions) || !value.careActions.every(isIntelligenceCareAction) ||
    !Array.isArray(value.semanticEvents) || !value.semanticEvents.every(isCanonicalEventProposal)) {
    throw new Error("Ask provider returned an invalid response.");
  }
  const allowedIds = new Set(records.map((record) => record.id));
  const answer = cleanAnswer(value.answer).slice(0, 1800);
  if (!answer) throw new Error("Ask provider returned an empty answer.");
  const answerSections = parseAnswerSections(value.answerSections);
  const relevantContextIds = [...new Set(value.relevantContextIds.filter((id): id is string => typeof id === "string" && allowedIds.has(id)))].slice(0, 8);
  const referencedTypes = new Set(relevantContextIds.map((id) => records.find((record) => record.id === id)?.sourceType).filter(Boolean));
  const frameValidation = validateProposedSemanticFrame(value.semanticFrame);
  let frameRecovery: SemanticFrameRecoveryTelemetry;
  let semanticFrame = frameValidation.frame;
  if (semanticFrame) {
    frameRecovery = { applied: false, reason: "NOT_ATTEMPTED_FRAME_VALID", validationReason: null };
  } else if (!frameValidation.candidate) {
    frameRecovery = { applied: false, reason: "NOT_ATTEMPTED_NO_CANDIDATE", validationReason: frameValidation.reason };
  } else if (frameValidation.reason !== "CLAIM_SUBJECT_REF_UNKNOWN") {
    frameRecovery = {
      applied: false,
      reason: "NOT_ATTEMPTED_NON_RECOVERABLE_VALIDATION_ERROR",
      validationReason: frameValidation.reason,
    };
  } else if (!recoveryContext) {
    frameRecovery = { applied: false, reason: "NOT_ATTEMPTED_RECOVERY_DISABLED", validationReason: frameValidation.reason };
  } else {
    const recovery = recoverOwnerPreferenceFrame(frameValidation.candidate, frameValidation.reason!, recoveryContext);
    semanticFrame = recovery.frame;
    frameRecovery = recovery.telemetry;
  }
  return {
    answer,
    answerSections,
    safetyLevel: value.safetyLevel as ParsedUnifiedResponse["safetyLevel"],
    responseMode: value.responseMode as AskResponseMode,
    shoppingSuppressed: intelligenceSafety.shoppingSuppressed,
    suggestedFollowUps: uniqueCleanSuggestedFollowUps(value.suggestedFollowUps),
    applicationActions: parseModelApplicationActions(value.applicationActions || [], sourceMessage),
    proposedHistoryUpdate: cleanProposedHistoryUpdate(value.proposedHistoryUpdate),
    userIntent: clean(value.userIntent).slice(0, 120),
    relevantContextIds,
    messageUnderstanding: value.messageUnderstanding,
    intelligenceSafety,
    learnings: value.learnings.slice(0, 5).map((learning) => ({
      ...learning,
      category: clean(learning.category).slice(0, 80),
      factKey: clean(learning.factKey).slice(0, 100),
      sourceExcerpt: String(learning.sourceExcerpt).slice(0, 160),
    })),
    careActions: value.careActions.slice(0, 3).map((action) => ({
      ...action,
      category: clean(action.category).slice(0, 80),
      title: cleanAnswer(action.title).slice(0, 120),
      details: cleanAnswer(action.details).slice(0, 500),
    })),
    semanticEvents: value.semanticEvents.slice(0, 4).map((event) => ({
      ...event,
      topic: clean(event.topic).slice(0, 100),
      eventTitle: cleanAnswer(event.eventTitle).slice(0, 120),
      sourceExcerpt: String(event.sourceExcerpt).slice(0, 240),
      subject: { ...event.subject, name: event.subject.name ? clean(event.subject.name).slice(0, 120) : null },
      temporal: { occurredAt: event.temporal.occurredAt, explicitTime: event.temporal.explicitTime ? clean(event.temporal.explicitTime).slice(0, 120) : null },
    })),
    semanticFrame: semanticFrame || emptyProposedSemanticFrame(),
    semanticFrameValid: Boolean(semanticFrame),
    semanticFrameRecovery: frameRecovery,
    intelligenceMetadata: {
      confidence: "high",
      usedPetContext: referencedTypes.has("profile") || records.some((record) => record.sourceType === "profile"),
      usedCareHistory: referencedTypes.has("care_update") || referencedTypes.has("active_concern") || referencedTypes.has("active_episode") || referencedTypes.has("resolved_episode"),
      usedMemories: referencedTypes.has("remembered_detail"),
    },
  };
}

function parseAnswerSections(value: unknown): AskReasoningResult["answer"]["sections"] {
  if (!Array.isArray(value) || value.length > 3) throw new Error("Ask provider returned invalid answer sections.");
  return value.map((section) => {
    if (!section || typeof section !== "object") throw new Error("Ask provider returned invalid answer sections.");
    const candidate = section as { heading?: unknown; items?: unknown };
    const heading = typeof candidate.heading === "string" ? cleanAnswer(candidate.heading).slice(0, 80) : "";
    if (!heading || !Array.isArray(candidate.items) || candidate.items.length < 1 || candidate.items.length > 4) {
      throw new Error("Ask provider returned invalid answer sections.");
    }
    const items = candidate.items.map((item) => typeof item === "string" ? cleanAnswer(item).slice(0, 260) : "");
    if (items.some((item) => !item)) throw new Error("Ask provider returned invalid answer sections.");
    return { heading, items };
  });
}

function normalizeIntelligenceSafety(value: unknown): AskReasoningResult["intelligenceSafety"] | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!["routine", "monitor", "urgent", "emergency", "recently_resolved"].includes(String(item.level)) ||
    typeof item.reason !== "string" || typeof item.requiresImmediateAction !== "boolean") return null;
  const level = item.level as AskReasoningResult["intelligenceSafety"]["level"];
  return {
    level,
    reason: clean(String(item.reason)).slice(0, 220),
    requiresImmediateAction: item.requiresImmediateAction,
    shoppingSuppressed: item.requiresImmediateAction || level === "urgent" || level === "emergency",
  };
}

export function areAskResponsesMateriallyIdentical(left: string, right: string) {
  const leftWords = normalizedResponseWords(left);
  const rightWords = normalizedResponseWords(right);
  if (!leftWords.length || !rightWords.length) return false;
  const leftText = leftWords.join(" ");
  const rightText = rightWords.join(" ");
  if (leftText === rightText) return true;
  const leftSet = new Set(leftWords);
  const rightSet = new Set(rightWords);
  const intersection = [...leftSet].filter((word) => rightSet.has(word)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union > 0 && intersection / union >= 0.88;
}

export function buildAskProviderRequest(promptContext: object) {
  return {
    max_output_tokens: ASK_MAX_OUTPUT_TOKENS,
    instructions: unifiedInstructions,
    input: JSON.stringify(promptContext),
    text: { format: { type: "json_schema", name: "furvise_ask_response", strict: true, schema: askUnifiedJsonSchema } },
  };
}

const buildProviderRequest = buildAskProviderRequest;

async function runProviderRequest<T>({ client, fallbackFrom, model, onEvent, parseOutput, request, stage, timeoutMs }: {
  client: AskReasoningOpenAiClient;
  fallbackFrom?: string;
  model: string;
  onEvent?: (event: AskProviderEvent) => void;
  parseOutput: (rawText: string) => T;
  request: Record<string, unknown>;
  stage: "primary" | "fallback" | "repair";
  timeoutMs: number;
}): Promise<T> {
  const started = Date.now();
  const configuredOutputLimit = typeof request.max_output_tokens === "number" ? request.max_output_tokens : undefined;
  onEvent?.({ stage, outcome: "started", model, elapsedMs: 0, fallbackFrom, configuredOutputLimit });
  try {
    const response = await createWithTimeout(client, {
      ...request,
      ...(supportsReasoningEffort(model) ? { reasoning: { effort: "low" } } : {}),
      model,
    }, timeoutMs);
    const result = interpretStructuredProviderResponse(response, parseOutput);
    const diagnostics = {
      configuredOutputLimit,
      elapsedMs: Date.now() - started,
      fallbackFrom,
      finishReason: result.finishReason,
      incompleteReason: result.incompleteReason,
      inputTokens: result.usage.inputTokens,
      outputLimitReached: result.status === "incomplete" && result.incompleteReason === "max_output_tokens",
      outputTokens: result.usage.outputTokens,
      parsingAttempted: result.parsingAttempted,
      rawOutputLength: result.rawText?.length || 0,
    };
    if (result.status === "completed" && result.parsed !== null) {
      onEvent?.({ stage, outcome: "succeeded", model, ...diagnostics });
      return result.parsed;
    }
    const failureStage = stage === "primary" ? "primary_invalid_output" : "fallback_invalid_output";
    const failure = new AskPipelineError(failureStage, result.errorMessage || "Ask provider returned invalid structured output.", {
      model,
      ...diagnostics,
      providerErrorCode: result.errorCode || "ASK_OUTPUT_INVALID",
      providerErrorType: result.status,
      validationDetails: result.errorMessage?.slice(0, 300),
    });
    onEvent?.({ stage, outcome: "failed", ...failure.diagnostics });
    throw failure;
  } catch (error) {
    if (error instanceof AiAdmissionError) throw error;
    if (error instanceof AskPipelineError) throw error;
    const diagnostics = providerDiagnostics(error);
    const failureStage = stage === "primary"
      ? diagnostics.timedOut ? "primary_timeout" : "primary_provider_failed"
      : diagnostics.timedOut ? "fallback_timeout" : "fallback_provider_failed";
    const failure = new AskPipelineError(failureStage, diagnostics.timedOut ? "Ask provider timed out." : "Ask provider request failed.", {
      model, elapsedMs: Date.now() - started, fallbackFrom, ...diagnostics,
    });
    onEvent?.({ stage, outcome: "failed", ...failure.diagnostics });
    throw failure;
  }
}

function supportsReasoningEffort(model: string) {
  return /^gpt-5(?:\.|-|$)/i.test(model);
}

function isRepairableStructuredOutput(error: AskPipelineError) {
  return error.diagnostics.providerErrorCode === "ASK_OUTPUT_INCOMPLETE" ||
    error.diagnostics.providerErrorCode === "ASK_OUTPUT_INVALID";
}

async function createWithTimeout(client: AskReasoningOpenAiClient, request: Record<string, unknown>, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const model = typeof request.model === "string" ? request.model : "";
    const maxOutputTokens = typeof request.max_output_tokens === "number" ? request.max_output_tokens : 0;
    return await executeAdmittedProviderCall({
      invoke: () => client.responses.create(request, { signal: controller.signal }),
      maxOutputTokens,
      model,
      providerInput: { input: request.input, instructions: request.instructions },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function providerDiagnostics(error: unknown) {
  const value = error as { code?: unknown; name?: unknown; status?: unknown; type?: unknown; headers?: Headers | Record<string, string> } | null;
  const errorName = typeof value?.name === "string" ? value.name : error instanceof Error ? error.name : "UnknownError";
  const headers = value?.headers;
  const retryAfterValue = headers instanceof Headers ? headers.get("retry-after") : headers?.["retry-after"];
  const parsedRetryAfterMs = retryAfterValue ? Math.max(0, Number(retryAfterValue) * 1000) : Number.NaN;
  return {
    providerStatus: typeof value?.status === "number" ? value.status : null,
    providerErrorType: typeof value?.type === "string" ? value.type : errorName,
    providerErrorCode: typeof value?.code === "string" ? value.code : "",
    timedOut: /Abort|Timeout/i.test(errorName) || value?.code === "ABORT_ERR",
    ...(Number.isFinite(parsedRetryAfterMs) ? { retryAfterMs: parsedRetryAfterMs } : {}),
  };
}

function isRetryableProviderLimit(error: AskPipelineError) {
  return error.diagnostics.providerStatus === 429 || error.diagnostics.providerErrorCode === "rate_limit_exceeded";
}

function isRequestRateLimit(error: AskPipelineError) {
  return error.diagnostics.providerStatus === 429 && /requests/i.test(error.diagnostics.providerErrorType || "");
}

function setProviderCooldown(model: string, retryAfterMs = 0) {
  const duration = Math.max(2_000, Math.min(60_000, retryAfterMs || 5_000));
  providerCooldowns.set(model, Date.now() + duration);
}

function buildContextRecords(input: BuildContextInput): AskContextRecord[] {
  const profiles = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const updates = new Map(input.recentUpdates.map((update) => [update.id, update]));
  const records: AskContextRecord[] = [];
  for (const profile of input.profiles) {
    const facts: Array<[string, unknown]> = [
      ["species", profile.species], ["breed", profile.breed],
      ["age", profile.age_value == null ? null : `${profile.age_value} ${profile.age_unit || "years"}`],
      ["weight", profile.weight_value == null ? null : `${profile.weight_value} ${profile.weight_unit || "lb"}`],
      ["current_food", profile.current_food], ["main_concern", profile.main_concern], ["care_goal", profile.wellness_goal],
      ["avoid_ingredients", profile.avoid_ingredients?.join(", ")], ["monthly_budget", profile.monthly_budget],
      ["sex", readOptionalString(profile, "sex") || readOptionalString(profile, "gender")], ["pronouns", readOptionalString(profile, "pronouns")],
      ["lifecycle_status", readOptionalString(profile, "lifecycle_status")], ["deceased_at", readOptionalString(profile, "deceased_at")],
    ];
    for (const [kind, value] of facts) {
      if (value === null || value === undefined || String(value).trim() === "") continue;
      records.push(baseRecord(`profile:${profile.id}:${kind}`, "profile", profile, kind, String(value), profile.updated_at));
    }
  }
  for (const concern of input.concerns || []) {
    const profile = profiles.get(concern.pet_profile_id);
    if (!profile) continue;
    records.push({
      ...baseRecord(`concern:${concern.id}`, "active_concern", profile, concern.normalized_key, concern.title, concern.updated_at),
      occurredAt: concern.opened_at,
      status: concern.status === "resolved" ? "resolved" : "active",
      priority: concern.severity,
      metadata: { concernId: concern.id, status: concern.status, sourceCareEntryId: concern.source_care_entry_id },
    });
  }
  for (const concern of input.recentlyResolvedConcerns || []) {
    const profile = profiles.get(concern.pet_profile_id);
    if (!profile) continue;
    records.push({
      ...baseRecord(`concern:${concern.id}`, "active_concern", profile, concern.normalized_key, concern.title, concern.updated_at),
      occurredAt: concern.resolved_at || concern.updated_at,
      status: "resolved",
      priority: concern.severity,
      metadata: {
        concernId: concern.id,
        resolutionNote: concern.resolution_note,
        status: concern.status,
        sourceCareEntryId: concern.source_care_entry_id,
      },
    });
  }
  for (const episode of [...(input.activeEpisodes || []), ...(input.recentlyResolvedEpisodes || [])]) {
    const profile = profiles.get(episode.pet_profile_id);
    if (!profile) continue;
    const resolved = episode.status === "resolved";
    const semanticTopic = typeof episode.summary?.semanticTopic === "string" ? episode.summary.semanticTopic : episode.normalized_key;
    records.push({
      ...baseRecord(`episode:${episode.id}`, resolved ? "resolved_episode" : "active_episode", profile, semanticTopic, episode.title || semanticTopic.replace(/_/g, " "), episode.last_event_at),
      occurredAt: episode.started_at || episode.last_event_at,
      status: resolved ? "resolved" : "active",
      priority: episode.severity === "urgent" ? "urgent" : episode.severity === "important" ? "important" : "routine",
      metadata: { episodeType: episode.episode_type, normalizedTopic: semanticTopic, canonicalEpisodeKey: episode.normalized_key, status: episode.status },
    });
  }
  for (const entry of input.careEntries) {
    const profile = profiles.get(entry.pet_profile_id);
    if (!profile) continue;
    const update = updates.get(entry.id);
    const concernTags = update?.concernTags.map(formatConcernTag) || [];
    records.push({
      ...baseRecord(`care:${entry.id}`, "care_update", profile, entry.category, [entry.title, entry.note].filter(Boolean).join(": "), entry.created_at),
      occurredAt: entry.occurred_at || entry.created_at,
      status: update?.active === true ? "active" : update?.active === false ? "resolved" : concernTags.length ? "possibly_active" : "unknown",
      priority: concernTags.length || entry.severity === "severe" ? "urgent" : entry.severity === "moderate" ? "important" : "routine",
      metadata: { category: entry.category, severity: entry.severity, title: entry.title || "Care update", concerns: concernTags.join(", ") },
    });
  }
  for (const memory of input.memories) {
    const profile = profiles.get(memory.dog_profile_id);
    if (!profile) continue;
    records.push({
      ...baseRecord(`memory:${memory.id}`, "remembered_detail", profile, memory.type || "saved_detail", memory.text, memory.created_at),
      status: /resolved|previous|past/i.test(memory.type || "") ? "resolved" : "unknown",
      priority: /safety|allerg|medication|treatment|avoid/i.test(`${memory.type} ${memory.text}`) ? "important" : "routine",
      metadata: { confidence: memory.confidence, source: memory.source },
    });
  }
  for (const feedback of input.productFeedback) {
    const profile = profiles.get(feedback.dog_profile_id);
    if (!profile) continue;
    records.push({
      ...baseRecord(`product-feedback:${feedback.id}`, "product_context", profile, feedback.feedback_type, `${feedback.product_name}: ${feedback.feedback_type}${feedback.note ? `. ${feedback.note}` : ""}`, feedback.created_at),
      metadata: { productId: feedback.product_id, feedbackType: feedback.feedback_type },
    });
  }
  const defaultProfile = input.profiles[0];
  if (defaultProfile) {
    for (const turn of input.conversationTurns.slice(-6)) {
      records.push({ ...baseRecord(`conversation:${turn.id}`, "conversation_turn", defaultProfile, turn.role, turn.text, turn.createdAt || null), metadata: { role: turn.role } });
    }
  }
  return records;
}

function chooseUpdates(updates: Array<{ record: AskContextRecord; score: number }>) {
  const mandatory = updates.filter(({ record }) => record.priority !== "routine" && record.status !== "resolved");
  const newest = [...updates].sort((a, b) => timestamp(b.record) - timestamp(a.record)).slice(0, 1);
  return dedupeScored([...mandatory, ...updates, ...newest]).slice(0, 5);
}

function compactRecord(record: AskContextRecord, fullDetail: boolean): AskContextRecord {
  const max = record.sourceType === "conversation_turn" ? 500 : fullDetail ? 520 : record.sourceType === "care_update" ? 180 : 280;
  return { ...record, value: clean(record.value).slice(0, max) };
}

function baseRecord(id: string, sourceType: AskContextSourceType, profile: DogProfileRow, kind: string, value: string, createdAt: string | null): AskContextRecord {
  return { id, sourceType, petId: profile.id, petName: profile.name, kind, value: clean(value).slice(0, 1200), occurredAt: null, createdAt, status: null, priority: null, metadata: {} };
}

function scoreRecord(record: AskContextRecord, terms: Set<string>, now: number) {
  const searchable = `${record.kind} ${record.value} ${Object.values(record.metadata).join(" ")}`.toLowerCase();
  let score = [...terms].reduce((sum, term) => sum + (searchable.includes(term) ? 10 : 0), 0);
  if (record.priority === "urgent" && record.status !== "resolved") score += 120;
  else if (record.priority === "important" && record.status !== "resolved") score += 60;
  if (record.status === "resolved") score -= 15;
  if (record.sourceType === "profile") score += 8;
  if (record.sourceType === "active_episode") score += 90;
  if (record.sourceType === "resolved_episode") score += 5;
  if (record.sourceType === "conversation_turn") score += 12;
  const ageDays = Math.max(0, (now - timestamp(record)) / 86_400_000);
  score += Math.max(0, 20 - ageDays / 2);
  return score;
}

function recordMatchesTerms(record: AskContextRecord, terms: Set<string>) {
  if (!terms.size) return false;
  const searchable = `${record.kind} ${record.value} ${Object.values(record.metadata).join(" ")}`.toLowerCase();
  return [...terms].some((term) => searchable.includes(term));
}

function meaningfulTerms(value: string) {
  const stop = new Set(["about", "after", "again", "could", "does", "have", "should", "their", "there", "these", "they", "this", "what", "when", "where", "which", "with", "would", "your"]);
  return new Set((value.toLowerCase().match(/[a-z0-9]+/g) || []).filter((term) => term.length > 2 && !stop.has(term)));
}

function dedupeScored(values: Array<{ record: AskContextRecord; score: number }>) {
  const seen = new Set<string>();
  return values.filter(({ record }) => !seen.has(record.id) && Boolean(seen.add(record.id)));
}

function timestamp(record: AskContextRecord) {
  return Date.parse(record.occurredAt || record.createdAt || "") || 0;
}

function isProposedHistoryUpdate(value: unknown): value is ProposedHistoryUpdate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.shouldOffer === "boolean" && ["category", "title", "details", "severity", "resolvesConcernId"].every((key) => candidate[key] === null || typeof candidate[key] === "string");
}

function cleanProposedHistoryUpdate(value: ProposedHistoryUpdate): ProposedHistoryUpdate {
  const optional = (candidate: string | null, max: number) => candidate ? cleanAnswer(candidate).slice(0, max) || null : null;
  return {
    shouldOffer: value.shouldOffer,
    category: optional(value.category, 80),
    title: optional(value.title, 120),
    details: optional(value.details, 400),
    severity: optional(value.severity, 40),
    resolvesConcernId: optional(value.resolvesConcernId, 160),
  };
}

function assertNoInternalReasoningLeak(answer: string, records: AskContextRecord[]) {
  if (/\b(?:context ids?|internal classifiers?|response schema|system instructions?|severity engine)\b/i.test(answer) || records.some((record) => answer.includes(record.id))) {
    throw new Error("Ask response exposed internal reasoning data.");
  }
}

function createClient(apiKey?: string): AskReasoningOpenAiClient | null {
  const key = apiKey?.trim();
  return key ? new OpenAI({ apiKey: key }) as AskReasoningOpenAiClient : null;
}

function readOptionalString(value: object, key: string) {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : null;
}

function normalizedResponseWords(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function clean(value: string) {
  return String(value || "").replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
}

function cleanAnswer(value: string) {
  return String(value || "").replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
}

function uniqueCleanSuggestedFollowUps(value: unknown[]) {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const suggestion = cleanAnswer(item).slice(0, 180);
    const key = suggestion.toLocaleLowerCase();
    if (!suggestion || seen.has(key)) continue;
    seen.add(key);
    suggestions.push(suggestion);
    if (suggestions.length === 4) break;
  }
  return suggestions;
}
