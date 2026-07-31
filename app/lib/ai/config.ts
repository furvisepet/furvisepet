export const OPENAI_ANALYSIS_MODEL = "gpt-5.4-mini";
export const OPENAI_PROVIDER_TIMEOUT_MS = 25_000;
export const OPENAI_OUTPUT_LIMITS = {
  analysis: 1_600,
  productFit: 800,
  productQuestion: 900,
  safetyFollowup: 800,
  shopInterpretation: 700,
} as const;

export type AiProviderName = "openai";

export function getAiProviderName(): AiProviderName {
  const provider = process.env.PETWISE_AI_PROVIDER || "openai";
  if (provider === "openai") return provider;
  throw new Error(`Unsupported AI provider: ${provider}`);
}
export function getAiRuntimeDiagnostics(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.OPENAI_API_KEY;
  const provider = env.PETWISE_AI_PROVIDER || "openai";
  return {
    keyPresent: apiKey !== undefined,
    keyNonEmpty: Boolean(apiKey?.trim()),
    model: OPENAI_ANALYSIS_MODEL,
    provider,
    providerSupported: provider === "openai",
  };
}
