import type { CanonicalEventProposal, IntelligenceCareAction, IntelligenceLearning, IntelligenceMessageUnderstanding } from "./types";

export const canonicalEventProposalJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["subject", "domain", "topic", "eventTitle", "transition", "state", "temporal", "importance", "confidence", "sourceExcerpt"],
  properties: {
    subject: { type: "object", additionalProperties: false, required: ["type", "name"], properties: {
      type: { type: "string", enum: ["pet", "owner", "household", "unknown"] },
      name: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
    } },
    domain: { type: "string", enum: ["health", "behavior", "nutrition", "medication", "safety", "routine", "preference", "profile", "shopping", "care", "other"] },
    topic: { type: "string", minLength: 2, maxLength: 100 },
    eventTitle: { type: "string", minLength: 2, maxLength: 120 },
    transition: { type: "string", enum: ["observed", "started", "continued", "changed", "improved", "worsened", "resolved", "corrected", "confirmed", "preference_set"] },
    state: { type: "string", enum: ["active", "monitoring", "resolved", "historical", "unknown"] },
    temporal: { type: "object", additionalProperties: false, required: ["occurredAt", "explicitTime"], properties: {
      occurredAt: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
      explicitTime: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
    } },
    importance: { type: "string", enum: ["routine", "important", "urgent"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sourceExcerpt: { type: "string", minLength: 1, maxLength: 240 },
  },
} as const;

export function isCanonicalEventProposal(value: unknown): value is CanonicalEventProposal {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const subject = item.subject as Record<string, unknown> | null;
  const temporal = item.temporal as Record<string, unknown> | null;
  if (!subject || !temporal) return false;
  return ["pet", "owner", "household", "unknown"].includes(String(subject.type)) &&
    (subject.name === null || typeof subject.name === "string") &&
    ["health", "behavior", "nutrition", "medication", "safety", "routine", "preference", "profile", "shopping", "care", "other"].includes(String(item.domain)) &&
    typeof item.topic === "string" && item.topic.length >= 2 && typeof item.eventTitle === "string" && item.eventTitle.length >= 2 &&
    ["observed", "started", "continued", "changed", "improved", "worsened", "resolved", "corrected", "confirmed", "preference_set"].includes(String(item.transition)) &&
    ["active", "monitoring", "resolved", "historical", "unknown"].includes(String(item.state)) &&
    (temporal.occurredAt === null || typeof temporal.occurredAt === "string") && (temporal.explicitTime === null || typeof temporal.explicitTime === "string") &&
    ["routine", "important", "urgent"].includes(String(item.importance)) && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 &&
    typeof item.sourceExcerpt === "string";
}

export const intelligenceIntentValues = [
  "question", "update", "correction", "concern_resolution", "new_symptom", "food", "routine",
  "behavior", "training", "medication", "product", "shopping", "vet_preparation",
  "general_conversation", "owner_preference", "pet_preference", "unknown",
] as const;

export const intelligenceLearningJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["subjectType", "subjectId", "category", "factKey", "factValue", "confidence", "importance", "durability", "action", "sourceExcerpt"],
  properties: {
    subjectType: { type: "string", enum: ["pet", "owner"] },
    subjectId: { anyOf: [{ type: "string" }, { type: "null" }] },
    category: { type: "string", maxLength: 80 }, factKey: { type: "string", maxLength: 100 },
    factValue: {
      anyOf: [
        { type: "string", maxLength: 500 }, { type: "number" }, { type: "boolean" }, { type: "null" },
        {
          type: "array", maxItems: 12,
          items: { anyOf: [{ type: "string", maxLength: 200 }, { type: "number" }, { type: "boolean" }] },
        },
      ],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 }, importance: { type: "string", enum: ["low", "medium", "high"] },
    durability: { type: "string", enum: ["temporary", "ongoing", "durable"] },
    action: { type: "string", enum: ["create", "confirm", "update", "supersede", "resolve", "none"] },
    sourceExcerpt: { type: "string", maxLength: 240 },
  },
} as const;

export const intelligenceCareActionJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["action", "category", "title", "details", "severity", "confidence", "relatedRecordId"],
  properties: {
    action: { type: "string", enum: ["create_entry", "resolve_concern", "reopen_concern", "update_profile", "none"] },
    category: { type: "string", maxLength: 80 }, title: { type: "string", maxLength: 120 }, details: { type: "string", maxLength: 800 },
    severity: { type: "string", enum: ["routine", "mild", "moderate", "urgent", "emergency"] },
    confidence: { type: "number", minimum: 0, maximum: 1 }, relatedRecordId: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

export function withIntelligenceLearningsSchema(base: Record<string, unknown>) {
  const properties = (base.properties && typeof base.properties === "object" ? base.properties : {}) as Record<string, unknown>;
  const required = Array.isArray(base.required) ? base.required : [];
  return {
    ...base,
    required: [...required, "learnings", "careActions"],
    properties: {
      ...properties,
      learnings: { type: "array", maxItems: 8, items: intelligenceLearningJsonSchema },
      careActions: { type: "array", maxItems: 3, items: intelligenceCareActionJsonSchema },
    },
  };
}

export const messageUnderstandingJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["primaryIntent", "secondaryIntents", "userIsAskingQuestion", "userIsProvidingUpdate", "userIsCorrectingPriorInformation", "userIsResolvingConcern", "userIsProvidingPreference", "userIsMakingSmallTalk", "requestedTopic", "referencedPet", "safetyRelevance", "needsClarification", "canAnswerDirectly"],
  properties: {
    primaryIntent: { type: "string", enum: [...intelligenceIntentValues] },
    secondaryIntents: { type: "array", maxItems: 4, items: { type: "string", enum: [...intelligenceIntentValues] } },
    userIsAskingQuestion: { type: "boolean" }, userIsProvidingUpdate: { type: "boolean" },
    userIsCorrectingPriorInformation: { type: "boolean" }, userIsResolvingConcern: { type: "boolean" },
    userIsProvidingPreference: { type: "boolean" }, userIsMakingSmallTalk: { type: "boolean" },
    requestedTopic: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
    referencedPet: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
    safetyRelevance: { type: "string", enum: ["none", "possible", "direct"] },
    needsClarification: { type: "boolean" }, canAnswerDirectly: { type: "boolean" },
  },
} as const;

export function isMessageUnderstanding(value: unknown): value is IntelligenceMessageUnderstanding {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return intelligenceIntentValues.includes(item.primaryIntent as never) && Array.isArray(item.secondaryIntents) &&
    item.secondaryIntents.every((intent) => intelligenceIntentValues.includes(intent as never)) &&
    ["userIsAskingQuestion", "userIsProvidingUpdate", "userIsCorrectingPriorInformation", "userIsResolvingConcern", "userIsProvidingPreference", "userIsMakingSmallTalk", "needsClarification", "canAnswerDirectly"].every((key) => typeof item[key] === "boolean") &&
    ["none", "possible", "direct"].includes(String(item.safetyRelevance));
}

export function isIntelligenceLearning(value: unknown): value is IntelligenceLearning {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["pet", "owner"].includes(String(item.subjectType)) && typeof item.category === "string" && typeof item.factKey === "string" &&
    typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 &&
    ["low", "medium", "high"].includes(String(item.importance)) && ["temporary", "ongoing", "durable"].includes(String(item.durability)) &&
    ["create", "confirm", "update", "supersede", "resolve", "none"].includes(String(item.action)) && typeof item.sourceExcerpt === "string";
}

export function isIntelligenceCareAction(value: unknown): value is IntelligenceCareAction {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["create_entry", "resolve_concern", "reopen_concern", "update_profile", "none"].includes(String(item.action)) &&
    typeof item.category === "string" && typeof item.title === "string" && typeof item.details === "string" &&
    ["routine", "mild", "moderate", "urgent", "emergency"].includes(String(item.severity)) &&
    typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1;
}
