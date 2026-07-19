import OpenAI from "openai";
import type { PetMemoryContext } from "../pet-memory";
import { FURVISE_SAFETY_LINE } from "../safety-copy.ts";
import { OPENAI_ANALYSIS_MODEL } from "./config.ts";

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
  memory: PetMemoryContext;
  question: string;
};

type GroundedAskOpenAiClient = {
  responses: {
    create(request: GroundedAskOpenAiRequest): Promise<{ output_text: string }>;
  };
};

type GroundedAskOpenAiRequest = {
  model: string;
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

const groundedAskSystemPrompt = [
  "You are Furvise, a pet-care memory assistant.",
  "You answer only from the saved pet profile and care history provided.",
  "You must not invent facts.",
  "You must clearly say when the saved history does not contain enough information.",
  "You do not diagnose.",
  "You do not replace a veterinarian.",
  "For medical concerns, suggest what to log and what to ask a veterinarian.",
  "For urgent signs, direct the user to veterinary/emergency care.",
  "Do not recommend products or live shopping results.",
  "Return strict JSON matching the provided schema.",
  "usedSavedFacts must copy exact strings from allowedFacts. Do not paraphrase usedSavedFacts.",
].join("\n");

export function isGroundedAskFallbackConfigured(apiKey = process.env.OPENAI_API_KEY) {
  return Boolean(apiKey?.trim());
}

export async function generateGroundedAskAnswer({
  apiKey = process.env.OPENAI_API_KEY,
  client,
  memory,
  question,
}: GenerateGroundedAskAnswerInput): Promise<AskStructuredResponse | null> {
  const activeClient = client || createGroundedAskClient(apiKey);
  if (!activeClient) return null;

  const payload = buildGroundedAskPromptPayload(memory, question);
  const response = await activeClient.responses.create({
    model: OPENAI_ANALYSIS_MODEL,
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
  });

  const parsed = parseGroundedAskOutput(JSON.parse(response.output_text), payload.allowedFacts);
  return parsed ? mapGroundedAskOutputToAskResponse(parsed) : null;
}

export function buildGroundedAskPromptPayload(memory: PetMemoryContext, question: string) {
  const profileFacts = [
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

  const recentCareEntries = memory.timeline.recentEntries.slice(0, 10).map(formatMemoryEntry);
  const recallEntries = memory.timeline.recallEntries.slice(0, 30).map(formatMemoryEntry);
  const savedDetails = memory.savedDetails.slice(0, 20).map((detail) => `${detail.label}: ${detail.value}.`);
  const productFeedback = isProductFeedbackRelevant(question)
    ? memory.productFeedback.slice(0, 8).map((item) =>
        `Product feedback for ${item.productId}: ${item.status}${item.note ? ` - ${item.note}` : ""}.`
      )
    : [];
  const missingContext = memory.derived.missingContext.slice(0, 8);
  const safetyFlags = memory.derived.safetyFlags.slice(0, 8);
  const allowedFacts = uniqueNonEmptyStrings([
    ...profileFacts,
    ...recentCareEntries,
    ...recallEntries,
    ...savedDetails,
    ...productFeedback,
  ]);

  return {
    question,
    petName: memory.pet.name,
    profileFacts,
    recentCareEntries,
    recallEntries,
    savedDetails,
    productFeedback,
    missingContext,
    safetyFlags,
    allowedFacts,
    instructions: [
      "Answer from allowedFacts and missingContext only.",
      "If allowedFacts do not support the question, set cannotAnswerFromSavedData to true.",
      "Do not include product recommendations.",
      "Do not include diagnosis or treatment claims.",
    ],
  };
}

export function parseGroundedAskOutput(
  value: unknown,
  allowedFacts: string[],
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
    safetyNote: cleanText(draft.safetyNote) || FURVISE_SAFETY_LINE,
    cannotAnswerFromSavedData: draft.cannotAnswerFromSavedData,
  };
}

export function mapGroundedAskOutputToAskResponse(output: GroundedAskModelOutput): AskStructuredResponse {
  const missingContext = output.cannotAnswerFromSavedData && output.missingContext.length === 0
    ? ["Saved history does not contain enough detail to answer this directly."]
    : output.missingContext;

  return {
    title: output.title,
    summary: output.answer,
    sections: [
      { heading: "Saved facts used", items: output.usedSavedFacts },
      { heading: "Missing context", items: missingContext },
      { heading: "What to log next", items: output.suggestedNextLogs },
      { heading: "What to ask the vet", items: output.vetQuestions },
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
