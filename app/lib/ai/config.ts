export const OPENAI_ANALYSIS_MODEL = "gpt-5.4-mini";

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