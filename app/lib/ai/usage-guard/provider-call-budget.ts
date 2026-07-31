import { getActiveAiAdmission } from "./context.ts";
import { AiAdmissionError } from "./errors.ts";

export async function executeAdmittedProviderCall<T>(input: {
  invoke: () => Promise<T>;
  maxOutputTokens: number;
  model: string;
  providerInput: unknown;
}) {
  const admission = getActiveAiAdmission();
  if (!admission) {
    const testRuntime = Boolean(process.env.NODE_TEST_CONTEXT);
    const explicitDevelopmentOverride = process.env.NODE_ENV !== "production" && process.env.FURVISE_AI_ALLOW_UNGUARDED_PROVIDER_IN_DEVELOPMENT === "true";
    if (testRuntime || explicitDevelopmentOverride) return input.invoke();
    throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "provider_call_without_admission");
  }
  const call = await admission.beginProviderCall({ input: input.providerInput, maxOutputTokens: input.maxOutputTokens, model: input.model });
  try {
    const response = await input.invoke();
    const usage = readProviderUsage((response as { usage?: unknown }).usage);
    if (!usage) throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "provider_usage_missing");
    await admission.recordProviderUsage(call.reservation, input.model, usage);
    return response;
  } catch (error) {
    admission.recordProviderFailure(call.reservation, input.model, error);
    throw error;
  }
}

export function readProviderUsage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const usage = value as { input_tokens?: unknown; output_tokens?: unknown; input_tokens_details?: { cached_tokens?: unknown } };
  if (!validTokens(usage.input_tokens) || !validTokens(usage.output_tokens)) return null;
  const cached = validTokens(usage.input_tokens_details?.cached_tokens) ? usage.input_tokens_details!.cached_tokens as number : 0;
  return { cachedInputTokens: cached, inputTokens: usage.input_tokens as number, outputTokens: usage.output_tokens as number };
}

function validTokens(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
