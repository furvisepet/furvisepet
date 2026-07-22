import "server-only";

import OpenAI from "openai";
import {
  PetWiseAnalysis,
  SafetyFollowupResult,
  analysisJsonSchema,
  parseAnalysis,
  parseSafetyFollowupResult,
  safetyFollowupJsonSchema,
} from "../../ai-analysis";
import { DogProfile, formatAge, formatAvoidIngredients, formatBudget, formatSpecies, formatWeight, selectedConcern } from "../../petwise";
import {
  buildShopInterpretationPromptInput,
  ShopQueryInterpretationValidationError,
  shopQueryInterpretationJsonSchema,
  validateShopQueryInterpretation,
  shopQueryInterpretationSystemPrompt,
  type ShopQueryInterpretation,
  type ShopQueryInterpretationInput,
} from "../../shop-query";
import {
  buildShopProductFitPromptInput,
  parseShopProductFitExplanation,
  shopProductFitExplanationJsonSchema,
  shopProductFitExplanationSystemPrompt,
  type ShopProductFitExplanation,
  type ShopProductFitExplanationInput,
} from "../../shop/product-fit-explanation";
import { OPENAI_ANALYSIS_MODEL, getAiRuntimeDiagnostics } from "../config";
import { AiAnalysisProvider, AnalyzeDogProfileInput, AnalyzeSafetyFollowupInput } from "../provider";

const systemPrompt = [
  "You are Furvise's cautious pet profile analysis layer.",
  "Return strict structured JSON only.",
  "Never diagnose and never state a suspected allergy as confirmed.",
  "Clearly distinguish confirmed facts from owner-reported observations.",
  "For emergency signs, stop shopping advice and recommend urgent veterinary care.",
  "Do not recommend medication or dosage.",
  "Do not recommend supplements when medication use is unknown.",
  "Do not invent prices, products, brands, ingredients, monthly costs, or links.",
  "Use only the user-provided profile and saved memories. Do not use outside assumptions.",
  "If information is missing, list useful follow-up questions.",
  "memorySuggestions should include only durable contextual observations or preferences, such as care reactions, dislikes, anxiety patterns, product response notes, or food preferences.",
  "Do not suggest canonical profile fields as memories: name, species, breed, age, weight, current food, budget, main concern, or avoidances.",
  "Do not put missing or unknown values in memorySuggestions. Keep unknown age, weight, current food, species, or mixed/unknown breed in missingInformation instead.",
  "Do not suggest memories that are mainly product ingredients unless the owner explicitly wants to avoid them.",
  "Keep confidence calibrated.",
  "recommendedConcernTags must use only these local matcher tags when applicable: Itchy skin, Sensitive stomach, Picky eating, Weight management, General wellness, Grooming.",
  "temporaryAvoidIngredients should contain only ingredients directly supported by the owner-provided profile or cautious temporary filters implied by emergency safety, not product ingredients.",
].join("\n");

const safetyFollowupSystemPrompt = [
  "You are Furvise's cautious health-safety follow-up review layer.",
  "Return strict structured JSON only.",
  "Never diagnose, name a disease, or state a suspected condition as confirmed.",
  "Use only the user-provided pet profile, original analysis, follow-up questions, and follow-up answers.",
  "Decide whether Furvise may show general demo shopping suggestions after a health-safety pause.",
  "If answers mention repeated vomiting, blood, collapse, severe weakness, bloating, trouble breathing, inability to keep water down, severe pain, suspected toxin, or rapid worsening, return urgent_vet or pause_products.",
  "If answers are vague, missing, contradictory, or uncertain, return pause_products.",
  "Only return show_products when the answers clearly indicate low immediate risk.",
  "When decision is show_products, safeToShowProducts must be true, urgency must be none, and productCautionLabel must say general shopping suggestions are not treatment recommendations.",
  "When decision is pause_products or urgent_vet, safeToShowProducts must be false.",
  "Do not recommend medication, dosage, supplements, treatments, brands, prices, links, or product data.",
  "memorySuggestions should include only durable owner-reported observations or preferences from the follow-up answers. Do not include missing, unknown, vague, or temporary safety-only details.",
  "Keep summary and reasons concise and suitable for display to a dog owner.",
].join("\n");

export class OpenAiAnalysisProvider implements AiAnalysisProvider {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key is not configured.");
    }

    this.client = new OpenAI({ apiKey });
  }

  async analyzeDogProfile({ memories = [], profile }: AnalyzeDogProfileInput): Promise<PetWiseAnalysis> {
    const response = await this.client.responses.create({
      model: OPENAI_ANALYSIS_MODEL,
      instructions: systemPrompt,
      input: JSON.stringify({
        profile: buildPromptProfile(profile),
        savedMemories: memories.map((memory) => ({
          type: memory.type,
          confidence: memory.confidence,
          source: memory.source,
          text: memory.text,
        })),
      }),
      text: {
        format: {
          type: "json_schema",
          name: "petwise_analysis",
          strict: true,
          schema: analysisJsonSchema,
        },
      },
    });

    const parsed = parseAnalysis(JSON.parse(response.output_text));
    if (!parsed) {
      throw new Error("OpenAI returned invalid Furvise analysis data.");
    }

    return parsed;
  }

  async analyzeSafetyFollowup({
    answers,
    originalAnalysis,
    profile,
    questions,
  }: AnalyzeSafetyFollowupInput): Promise<SafetyFollowupResult> {
    const response = await this.client.responses.create({
      model: OPENAI_ANALYSIS_MODEL,
      instructions: safetyFollowupSystemPrompt,
      input: JSON.stringify({
        profile: buildPromptProfile(profile),
        originalAnalysis,
        followUpQuestions: questions,
        followUpAnswers: answers,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "petwise_safety_followup",
          strict: true,
          schema: safetyFollowupJsonSchema,
        },
      },
    });

    const parsed = parseSafetyFollowupResult(JSON.parse(response.output_text));
    if (!parsed) {
      throw new Error("OpenAI returned invalid Furvise safety follow-up data.");
    }

    return parsed;
  }

  async interpretShopQuery(input: ShopQueryInterpretationInput): Promise<ShopQueryInterpretation> {
    logShopProviderDiagnostic("request reached provider", getAiRuntimeDiagnostics());
    const response = await this.client.responses.create({
      model: OPENAI_ANALYSIS_MODEL,
      instructions: shopQueryInterpretationSystemPrompt,
      input: JSON.stringify(buildShopInterpretationPromptInput(input)),
      text: {
        format: {
          type: "json_schema",
          name: "furvise_shop_query_interpretation",
          strict: true,
          schema: shopQueryInterpretationJsonSchema,
        },
      },
    });

    let raw: unknown;
    try {
      raw = JSON.parse(response.output_text);
    } catch (error) {
      throw new ShopQueryInterpretationValidationError(
        [error instanceof Error ? `response JSON parse failed: ${error.message}` : "response JSON parse failed"],
        response.output_text,
      );
    }

    logShopProviderDiagnostic("raw structured response", { rawStructuredResponse: raw });
    const validation = validateShopQueryInterpretation(raw);
    if (!validation.ok) {
      throw new ShopQueryInterpretationValidationError(validation.errors, raw);
    }

    return validation.interpretation;
  }

  async explainShopProductFit(input: ShopProductFitExplanationInput): Promise<ShopProductFitExplanation> {
    const response = await this.client.responses.create({
      model: OPENAI_ANALYSIS_MODEL,
      instructions: shopProductFitExplanationSystemPrompt,
      input: JSON.stringify(buildShopProductFitPromptInput(input)),
      text: {
        format: {
          type: "json_schema",
          name: "furvise_shop_product_fit_explanation",
          strict: true,
          schema: shopProductFitExplanationJsonSchema,
        },
      },
    });

    const parsed = parseShopProductFitExplanation(
      JSON.parse(response.output_text),
      input.memory.pet.name || "this pet",
    );
    if (!parsed) {
      throw new Error("OpenAI returned invalid Furvise shop product fit explanation data.");
    }

    return parsed;
  }
}

function logShopProviderDiagnostic(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" && process.env.SHOP_AI_DIAGNOSTICS !== "true") return;
  console.info("[Furvise shop AI provider]", { message, ...details });
}

function buildPromptProfile(profile: DogProfile) {
  return {
    name: profile.name.trim(),
    species: formatSpecies(profile.species),
    breed: profile.breed.trim() || null,
    age: formatAge(profile),
    weight: formatWeight(profile),
    currentFood: profile.currentFoodUnknown ? "I'm not sure" : profile.currentFood.trim() || null,
    mainConcern: selectedConcern(profile) || null,
    avoidIngredients: formatAvoidIngredients(profile),
    monthlyBudget: formatBudget(profile),
  };
}
