import { SHOP_QUERY_INTERPRETATION_PROMPT_RULES, shopQueryInterpretationJsonSchema } from "../shop-query.ts";
import { SHOP_PRODUCT_QUESTION_PROMPT_RULES, shopProductQuestionJsonSchema } from "../shop/product-question.ts";
import { SHOP_PRODUCT_FIT_PROMPT_RULES, shopProductFitExplanationJsonSchema } from "../shop/product-fit-explanation.ts";
import { intelligenceSafetyFollowupJsonSchema } from "./safety-followup.ts";
import { intelligenceVetBriefJsonSchema } from "./vet-brief.ts";
import type { IntelligenceFeature } from "./types.ts";

export type IntelligenceFeatureMode = {
  feature: IntelligenceFeature;
  creditFeature: "ask" | "product_question" | "product_query" | "product_explanation" | "safety_followup" | "vet_brief" | "care_plan";
  contextPolicy: {
    careEntryLimit: number;
    conversationLimit: number;
    memoryLimit: number;
    needsConversation: boolean;
    needsProductContext: boolean;
  };
  persistencePolicy: {
    allowCareActions: boolean;
    allowMemories: boolean;
  };
  safetyPolicy: {
    suppressShoppingWhenUrgent: boolean;
  };
  responseSchema: Record<string, unknown> | null;
  responseSchemaName: string;
  promptInstructions: readonly string[];
};

const modes = {
  ask: mode("ask", "ask", null, "furvise_ask_response", { care: true, memories: true, conversation: true }),
  product_question: mode("product_question", "product_question", shopProductQuestionJsonSchema, "furvise_product_question", {
    care: false, memories: true, product: true,
    instructions: [
      "You are a knowledgeable Furvise store advisor answering one question about the pet product already on screen.",
      ...SHOP_PRODUCT_QUESTION_PROMPT_RULES,
      "Answer only about the server-loaded product and selected pet.",
      "Never invent ingredients, availability, warnings, suitability, or veterinary approval.",
      "Treat saved ingredient exclusions as hard constraints.",
      "When current safety is urgent or emergency, suppress shopping guidance.",
    ],
  }),
  product_query_interpretation: mode("product_query_interpretation", "product_query", shopQueryInterpretationJsonSchema, "furvise_product_query", {
    care: false, memories: true, product: true,
    instructions: [
      ...SHOP_QUERY_INTERPRETATION_PROMPT_RULES,
      "Interpret the current shopping query. Do not recommend or invent products and never produce SQL.",
      "The current query overrides older preferences when they conflict.",
      "Keep saved ingredient exclusions as hard constraints unless the user explicitly corrects them.",
      "Catalog filtering and ranking happen deterministically after this response.",
    ],
  }),
  product_explanation: mode("product_explanation", "product_explanation", shopProductFitExplanationJsonSchema, "furvise_product_explanation", {
    care: false, memories: false, product: true,
    instructions: [
      "You are a knowledgeable Furvise store advisor explaining one pet product that is already on screen.",
      ...SHOP_PRODUCT_FIT_PROMPT_RULES,
      "Explain only the server-loaded product. Never invent catalog or ingredient facts.",
    ],
  }),
  safety_followup: mode("safety_followup", "safety_followup", intelligenceSafetyFollowupJsonSchema, "furvise_safety_followup", {
    care: true, memories: true,
    instructions: [
      "Evaluate the owner follow-up against the original concern and authoritative live care state.",
      "Classify whether evidence confirms urgency, raises urgency, lowers urgency, resolves the concern, remains ambiguous, or needs one more question.",
      "Do not preserve urgency after a clear grounded resolution. Vague improvement must not silently resolve an emergency.",
      "reasoningSummary is a concise evidence-based explanation, never hidden chain-of-thought.",
      "Use saved sex or pronouns only when explicitly present. Otherwise use the pet's name or neutral language.",
    ],
  }),
  vet_brief: mode("vet_brief", "vet_brief", intelligenceVetBriefJsonSchema, "furvise_vet_brief", {
    care: false, memories: false, conversation: true,
    limits: { care: 300, conversations: 20, memories: 100 },
    instructions: [
      "Organize only the supplied deterministic draft and recorded source facts.",
      "Never invent medication, treatment, visit, symptom, date, product, or profile details.",
      "Preserve Not recorded whenever the supplied draft has no recorded information.",
      "Keep owner reports attributed as owner-reported information and do not convert suspicions into facts.",
      "sourceRecordIds may contain only IDs supplied in allowedSourceRecordIds.",
    ],
  }),
  care_plan: mode("care_plan", "care_plan", null, "furvise_care_plan", { care: false, memories: false }),
} satisfies Record<IntelligenceFeature, IntelligenceFeatureMode>;

export function getIntelligenceFeatureMode(feature: IntelligenceFeature): IntelligenceFeatureMode {
  return modes[feature];
}

function mode(
  feature: IntelligenceFeature,
  creditFeature: IntelligenceFeatureMode["creditFeature"],
  responseSchema: Record<string, unknown> | null,
  responseSchemaName: string,
  options: {
    care: boolean;
    memories: boolean;
    conversation?: boolean;
    product?: boolean;
    instructions?: string[];
    limits?: { care?: number; conversations?: number; memories?: number };
  },
): IntelligenceFeatureMode {
  return {
    feature, creditFeature,
    contextPolicy: {
      careEntryLimit: options.limits?.care || 80,
      conversationLimit: options.limits?.conversations || 12,
      memoryLimit: options.limits?.memories || 100,
      needsConversation: Boolean(options.conversation),
      needsProductContext: Boolean(options.product),
    },
    persistencePolicy: { allowCareActions: options.care, allowMemories: options.memories },
    safetyPolicy: { suppressShoppingWhenUrgent: feature === "product_question" || feature === "product_query_interpretation" || feature === "product_explanation" },
    responseSchema, responseSchemaName,
    promptInstructions: options.instructions || [],
  };
}
