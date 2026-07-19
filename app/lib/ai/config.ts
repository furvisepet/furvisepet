export const OPENAI_ANALYSIS_MODEL = "gpt-5.4-mini";

export type AiProviderName = "openai";

export function getAiProviderName(): AiProviderName {
  const provider = process.env.PETWISE_AI_PROVIDER || "openai";
  if (provider === "openai") return provider;
  throw new Error(`Unsupported AI provider: ${provider}`);
}
