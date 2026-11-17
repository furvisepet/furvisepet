export const OPENAI_ANALYSIS_MODEL = "gpt-5.4-mini";
export const OPENAI_PROVIDER_TIMEOUT_MS = 25_000;
export const OPENAI_OUTPUT_LIMITS = {
  analysis: 1_600,
  productFit: 800,
  productQuestion: 900,
  safetyFollowup: 800,
  shopInterpretation: 700,
} as const;
