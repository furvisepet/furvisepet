import OpenAI from "openai";
import { executeAdmittedProviderCall } from "./usage-guard/provider-call-budget.ts";
import {
  buildFurviseSafetyLine,
  buildMissingSavedInformationMessage,
  FURVISE_SHARED_PROMPT_RULES,
} from "../furvise-voice.ts";
import type { PetMemoryContext } from "../pet-memory.ts";
import { FURVISE_SAFETY_LINE } from "../safety-copy.ts";
import { OPENAI_ANALYSIS_MODEL, OPENAI_OUTPUT_LIMITS } from "./config.ts";
import {
  getPetReferenceGuidance,
  removeUnsupportedGenderedPronouns,
  type RecentAskUpdate,
} from "../ask-safety-context.ts";

export type GroundedAskModelOutput = {
  title: string;
  answer: string;
  usedSavedFacts: string[];
  missingContext: string[];
  suggestedNextLogs: string[];
  vetQuestions: string[];
  safetyNote: string;
  cannotAnswerFromSavedData: boolean;
};

export type AskStructuredResponse = {
  title: string;
  summary: string;
  sections: { heading: string; items: string[] }[];
  safetyNote: string | null;
};

type GenerateGroundedAskAnswerInput = {
  apiKey?: string;
  client?: GroundedAskOpenAiClient;
  conversation?: Array<{ role: string; text?: string; response?: { directAnswer?: string; summary?: string } | null }>;
  memory: PetMemoryContext;
  question: string;
  selectedContext?: {
    careEntries?: PetMemoryContext["timeline"]["recallEntries"];
    savedDetails?: PetMemoryContext["savedDetails"];
    productFeedback?: PetMemoryContext["productFeedback"];
    profileFacts?: string[];
    recentUpdates?: RecentAskUpdate[];
  };
};

type GroundedAskOpenAiClient = {
  responses: {
    create(request: GroundedAskOpenAiRequest, options?: { signal?: AbortSignal }): Promise<{ output_text: string; usage?: unknown }>;
  };
};

type GroundedAskOpenAiRequest = {
  model: string;
  max_output_tokens: number;
  instructions: string;
  input: string;
  text: {
    format: {
      type: "json_schema";
      name: string;
      strict: true;
      schema: typeof groundedAskJsonSchema;
    };
  };
};

export const groundedAskJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "answer",
    "usedSavedFacts",
    "missingContext",
    "suggestedNextLogs",
    "vetQuestions",
    "safetyNote",
    "cannotAnswerFromSavedData",
  ],
  properties: {
    title: { type: "string", maxLength: 120 },
    answer: { type: "string", maxLength: 900 },
    usedSavedFacts: {
      type: "array",
      maxItems: 8,
      items: { type: "string", maxLength: 500 },
    },
    missingContext: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 240 },
    },
    suggestedNextLogs: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 240 },
    },
    vetQuestions: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 240 },
    },
    safetyNote: { type: "string", maxLength: 500 },
    cannotAnswerFromSavedData: { type: "boolean" },
  },
} as const;

export const groundedAskSystemPrompt = [
  "You are Furvise, a thoughtful pet-care advisor who remembers the pet.",
  ...FURVISE_SHARED_PROMPT_RULES,
  "Answer using only the relevant pet details and care history in the input.",
  "Never invent a fact or fill a gap with an assumption.",
  "When something useful is missing, say so in plain language and name only the missing detail that matters.",
  "You do not diagnose.",
  "For medical concerns, suggest what to watch or log and what to ask a veterinarian when useful.",
  "For urgent signs, put immediate veterinary or emergency care before every other point.",
  "Follow petReferenceGuidance exactly. Never infer sex or gender from a pet's name, species, breed, or photo.",
  "Treat active recentUpdates as higher priority than the current question, conversation context, profile facts, or preferences.",
  "Do not recommend products or live shopping results.",
  "Return strict JSON matching the requested structure.",
  "Copy any usedSavedFacts exactly from allowedFacts. Do not paraphrase those audit values.",
  "Use no more than one suggestedNextLogs item for a normal question.",
  "Use vetQuestions only when the question is medical or safety-sensitive.",
  "safetyNote must exactly match requiredSafetyNote.",
].join("\n");

export function isGroundedAskFallbackConfigured(apiKey = process.env.OPENAI_API_KEY) {
  return Boolean(apiKey?.trim());
}

export async function generateGroundedAskAnswer({
  apiKey = process.env.OPENAI_API_KEY,
  client,
  conversation = [],
  memory,
  question,
  selectedContext,
}: GenerateGroundedAskAnswerInput): Promise<AskStructuredResponse | null> {
  const activeClient = client || createGroundedAskClient(apiKey);
  if (!activeClient) return null;

  const payload = buildGroundedAskPromptPayload(memory, question, selectedContext, conversation);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);
  try {
    const providerRequest: GroundedAskOpenAiRequest = {
      model: OPENAI_ANALYSIS_MODEL,
      max_output_tokens: OPENAI_OUTPUT_LIMITS.analysis,
      instructions: groundedAskSystemPrompt,
      input: JSON.stringify(payload),
      text: {
        format: {
          type: "json_schema",
          name: "furvise_grounded_ask",
          strict: true,
          schema: groundedAskJsonSchema,
        },
      },
    };
    const response = await executeAdmittedProviderCall({
      invoke: () => activeClient.responses.create(providerRequest, { signal: controller.signal }),
      maxOutputTokens: OPENAI_OUTPUT_LIMITS.analysis,
      model: OPENAI_ANALYSIS_MODEL,
      providerInput: { input: providerRequest.input, instructions: providerRequest.instructions },
    });

    const parsed = parseGroundedAskOutput(
      JSON.parse(response.output_text),
      payload.allowedFacts,
      payload.requiredSafetyNote,
    );
    if (!parsed) return null;
    const mapped = mapGroundedAskOutputToAskResponse(parsed);
    const reference = getPetReferenceGuidance({
      name: memory.pet.name,
      species: memory.pet.species,
    });
    return reference.allowsGenderedPronouns ? mapped : neutralizeAskStructuredResponse(mapped, memory.pet.name);
  } finally {
    clearTimeout(timeout);
  }
}

export function buildGroundedAskPromptPayload(
  memory: PetMemoryContext,
  question: string,
  selectedContext?: GenerateGroundedAskAnswerInput["selectedContext"],
  conversation: GenerateGroundedAskAnswerInput["conversation"] = [],
) {
  const allProfileFacts = [
    memory.pet.species ? `${memory.pet.name} is saved as a ${memory.pet.species}.` : "",
    memory.pet.breed ? `Breed: ${memory.pet.breed}.` : "",
    memory.pet.ageLabel ? `Age: ${memory.pet.ageLabel}.` : "",
    memory.pet.weightLabel ? `Weight: ${memory.pet.weightLabel}.` : "",
    memory.pet.mainConcern ? `Main concern: ${memory.pet.mainConcern}.` : "",
    memory.pet.currentFood ? `Current food: ${memory.pet.currentFood}.` : "",
    memory.pet.avoidIngredients.length ? `Avoid ingredients: ${formatList(memory.pet.avoidIngredients)}.` : "",
    memory.pet.monthlyBudget ? `Monthly care budget: ${memory.pet.monthlyBudget}.` : "",
    memory.pet.wellnessGoal ? `Wellness goal: ${memory.pet.wellnessGoal}.` : "",
  ].filter(Boolean);
  const profileFacts = selectedContext ? (selectedContext.profileFacts || []) : allProfileFacts;
  const selectedEntries = selectedContext?.careEntries || memory.timeline.recallEntries;
  const recentUpdates = selectedContext?.recentUpdates || [];
  const recentCareEntries = recentUpdates.length
    ? recentUpdates.map(formatRecentAskUpdate)
    : selectedEntries.slice(0, 10).map(formatMemoryEntry);
  const recallEntries: string[] = [];
  const selectedDetails = selectedContext?.savedDetails || memory.savedDetails;
  const savedDetails = selectedDetails.slice(0, 6).map((detail) => `${detail.label}: ${detail.value}.`);
  const productFeedback = isProductFeedbackRelevant(question)
    ? (selectedContext?.productFeedback || memory.productFeedback).slice(0, 4).map((item) =>
        `Product feedback for ${item.productId}: ${item.status}${item.note ? ` - ${item.note}` : ""}.`
      )
    : [];
  const missingContext = memory.derived.missingContext.filter((item) => isMissingDetailRelevant(item, question)).slice(0, 2);
  const safetyFlags = memory.derived.safetyFlags.slice(0, 8);
  const allowedFacts = uniqueNonEmptyStrings([
    ...profileFacts,
    ...recentCareEntries,
    ...recallEntries,
    ...savedDetails,
    ...productFeedback,
  ]);
  const petReferenceGuidance = getPetReferenceGuidance({
    name: memory.pet.name,
    species: memory.pet.species,
  }).instruction;

  return {
    question,
    conversation: conversation.slice(-8).map((message) => ({
      role: message.role,
      text: cleanText(message.text || message.response?.directAnswer || message.response?.summary || "").slice(0, 500),
    })).filter((message) => message.text),
    petName: memory.pet.name,
    petReferenceGuidance,
    requiredSafetyNote: buildFurviseSafetyLine(memory.pet.name || "your pet"),
    profileFacts,
    recentCareEntries,
    recentUpdates: recentUpdates.map((update) => ({
      active: update.active,
      category: update.category,
      createdAt: update.createdAt,
      details: update.details,
      occurredAt: update.occurredAt,
      severity: update.severity,
      title: update.title,
    })),
    recallEntries,
    savedDetails,
    productFeedback,
    missingContext,
    safetyFlags,
    allowedFacts,
    instructions: [
      "Answer from allowedFacts and missingContext only, using only details relevant to the question.",
      "Before answering the current question, address any active concerning recent update and ask whether it has resolved.",
      petReferenceGuidance,
      "If allowedFacts do not support the question, set cannotAnswerFromSavedData to true.",
      "Do not include product recommendations.",
      "Do not include diagnosis or treatment claims.",
      "Treat owner observations as reports, not confirmed conditions.",
      "Use recent conversation turns to resolve references and corrections.",
      "Lead with a direct answer or safe first step. Ask at most one focused clarification.",
    ],
  };
}

function isMissingDetailRelevant(detail: string, question: string) {
  const value = `${detail} ${question}`.toLowerCase();
  if (/weight|dose|medication|supplement/.test(value) && /dose|medication|supplement|weight/.test(question.toLowerCase())) return true;
  if (/food/.test(detail.toLowerCase()) && /food|diet|eat|meal/.test(question.toLowerCase())) return true;
  if (/age/.test(detail.toLowerCase()) && /age|puppy|kitten|senior/.test(question.toLowerCase())) return true;
  return false;
}

export function parseGroundedAskOutput(
  value: unknown,
  allowedFacts: string[],
  requiredSafetyNote = FURVISE_SAFETY_LINE,
): GroundedAskModelOutput | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<GroundedAskModelOutput>;
  if (
    typeof draft.title !== "string" ||
    typeof draft.answer !== "string" ||
    !Array.isArray(draft.usedSavedFacts) ||
    !Array.isArray(draft.missingContext) ||
    !Array.isArray(draft.suggestedNextLogs) ||
    !Array.isArray(draft.vetQuestions) ||
    typeof draft.safetyNote !== "string" ||
    typeof draft.cannotAnswerFromSavedData !== "boolean"
  ) {
    return null;
  }

  const allowed = new Set(allowedFacts.map(cleanText).filter(Boolean));
  const usedSavedFacts = cleanStringArray(draft.usedSavedFacts, 8);
  if (usedSavedFacts.some((fact) => !allowed.has(fact))) return null;

  const answer = cleanText(draft.answer);
  if (!answer || hasDisallowedMedicalClaim(answer) || hasProductRecommendation(answer)) return null;

  return {
    title: cleanText(draft.title).slice(0, 120) || "Saved pet memory",
    answer,
    usedSavedFacts,
    missingContext: cleanStringArray(draft.missingContext, 6),
    suggestedNextLogs: cleanStringArray(draft.suggestedNextLogs, 6),
    vetQuestions: cleanStringArray(draft.vetQuestions, 6),
    safetyNote: requiredSafetyNote,
    cannotAnswerFromSavedData: draft.cannotAnswerFromSavedData,
  };
}

export function mapGroundedAskOutputToAskResponse(output: GroundedAskModelOutput): AskStructuredResponse {
  const missingContext = output.cannotAnswerFromSavedData && output.missingContext.length === 0
    ? [buildMissingSavedInformationMessage("this pet")]
    : output.missingContext.slice(0, 1);

  return {
    title: output.title,
    summary: output.answer,
    sections: [
      { heading: "What is missing", items: missingContext },
      { heading: "Next step", items: output.suggestedNextLogs.slice(0, 1) },
      { heading: "Questions for your veterinarian", items: output.vetQuestions.slice(0, 2) },
    ].filter((section) => section.items.length > 0),
    safetyNote: output.safetyNote || FURVISE_SAFETY_LINE,
  };
}

function createGroundedAskClient(apiKey?: string): GroundedAskOpenAiClient | null {
  const key = apiKey?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key }) as GroundedAskOpenAiClient;
}

function formatMemoryEntry(entry: PetMemoryContext["timeline"]["recentEntries"][number]) {
  return `${formatDate(entry.date)} - ${formatCareCategory(entry.category)} - ${entry.title}${entry.detail ? ` - ${entry.detail}` : ""}.`;
}

function formatRecentAskUpdate(update: RecentAskUpdate) {
  return `${formatDate(update.occurredAt)} - ${formatCareCategory(update.category)} - ${update.title}${update.details ? ` - ${update.details}` : ""}${update.severity ? ` - Severity: ${update.severity}` : ""}${update.active === null ? "" : ` - Active: ${update.active ? "yes" : "no"}`}.`;
}

function neutralizeAskStructuredResponse(response: AskStructuredResponse, petName: string): AskStructuredResponse {
  return {
    ...response,
    title: removeUnsupportedGenderedPronouns(response.title, petName),
    summary: removeUnsupportedGenderedPronouns(response.summary, petName),
    sections: response.sections.map((section) => ({
      heading: removeUnsupportedGenderedPronouns(section.heading, petName),
      items: section.items.map((item) => removeUnsupportedGenderedPronouns(item, petName)),
    })),
    safetyNote: response.safetyNote ? removeUnsupportedGenderedPronouns(response.safetyNote, petName) : null,
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatCareCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function isProductFeedbackRelevant(question: string) {
  return /\b(product|food|brand|recommend|worked|tried|expensive)\b/i.test(question);
}

function hasDisallowedMedicalClaim(value: string) {
  return /\b(has|have|is|are|suffers from|diagnosed with)\b.{0,50}\b(allergy|infection|disease|condition|pancreatitis|parasite|tumou?r|cancer)\b/i.test(value);
}

function hasProductRecommendation(value: string) {
  return /\b(buy|purchase|order|shop for|recommend|try)\b.{0,50}\b(product|food|treat|shampoo|supplement|brand)\b/i.test(value);
}

function cleanStringArray(values: string[], maxItems: number) {
  return values.map(cleanText).filter(Boolean).slice(0, maxItems);
}

function uniqueNonEmptyStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = cleanText(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function cleanText(value: string) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
