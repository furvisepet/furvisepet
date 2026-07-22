import "server-only";

import {
  AnalysisMemoryContext,
  PetWiseAnalysis,
  SafetyFollowupAnswer,
  SafetyFollowupResult,
} from "../ai-analysis";
import { DogProfile } from "../petwise";
import type {
  ShopQueryInterpretation,
  ShopQueryInterpretationInput,
} from "../shop-query";
import type {
  ShopProductFitExplanation,
  ShopProductFitExplanationInput,
} from "../shop/product-fit-explanation";
import { getAiProviderName } from "./config";
import { OpenAiAnalysisProvider } from "./providers/openai";

export type AnalyzeDogProfileInput = {
  profile: DogProfile;
  memories?: AnalysisMemoryContext[];
};

export type AnalyzeSafetyFollowupInput = {
  profile: DogProfile;
  originalAnalysis: PetWiseAnalysis;
  questions: string[];
  answers: SafetyFollowupAnswer[];
};

export interface AiAnalysisProvider {
  analyzeDogProfile(input: AnalyzeDogProfileInput): Promise<PetWiseAnalysis>;
  analyzeSafetyFollowup(input: AnalyzeSafetyFollowupInput): Promise<SafetyFollowupResult>;
  explainShopProductFit(input: ShopProductFitExplanationInput): Promise<ShopProductFitExplanation>;
  interpretShopQuery(input: ShopQueryInterpretationInput): Promise<ShopQueryInterpretation>;
}

export function createAiAnalysisProvider(): AiAnalysisProvider {
  const provider = getAiProviderName();
  if (provider === "openai") return new OpenAiAnalysisProvider();
  throw new Error(`Unsupported AI provider: ${provider}`);
}
