import { consumeCatalogContinuationToken, type CatalogContinuationToken } from "../../intelligence/catalog-intent.ts";
import type { PipelineStage } from "../execution-deadline.ts";
import { getActiveAiAdmission } from "./context.ts";
import { getAiFeaturePolicy } from "./features.ts";
import type { AiGuardFeature } from "./types.ts";
import { AiAdmissionError } from "./errors.ts";

export type ProviderCallPurpose = "catalog_continuation" | "interpretation_repair" | "generation_repair" | "history_review" | "history_repair" | "history_rereview"
  | "task_review" | "task_repair" | "task_rereview";
/** Producers declare their server feature's limit; admission still validates independently. */
export function featureOutputLimit(requestedMaximum: number, fallbackFeature: AiGuardFeature = "ask"): number {
  if (!Number.isSafeInteger(requestedMaximum) || requestedMaximum <= 0)
    throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_request_contract_mismatch");
  const feature = getActiveAiAdmission()?.feature ?? fallbackFeature;
  return Math.min(requestedMaximum, getAiFeaturePolicy(feature).maxOutputTokens);
}

/** Both answer routes share one review/repair allowance, never two budgets. */
export function canonicalReviewPurpose(purpose?: ProviderCallPurpose) {
  if (purpose === "task_review") return "history_review";
  if (purpose === "task_repair") return "history_repair";
  if (purpose === "task_rereview") return "history_rereview";
  return purpose;
}

export async function executeAdmittedProviderCall<T>(input: {
  purpose?: ProviderCallPurpose;
  catalogAuthorization?: CatalogContinuationToken;
  invoke: () => Promise<T>;
  reserveMs?: number;
  stage?: PipelineStage;
  maxOutputTokens: number;
  model: string;
  providerInput: unknown;
}) {
  input = { ...input, purpose: canonicalReviewPurpose(input.purpose) };
  if (input.purpose === "catalog_continuation") {
    if (input.stage !== "catalog_continuation") throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "catalog_authority_wrong_phase");
    consumeCatalogContinuationToken(input.catalogAuthorization);
  }
  else if (input.catalogAuthorization) throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "catalog_authority_wrong_phase");
  const admission = getActiveAiAdmission();
  if (!admission) {
    const testRuntime = Boolean(process.env.NODE_TEST_CONTEXT);
    const explicitDevelopmentOverride = process.env.NODE_ENV !== "production" && process.env.FURVISE_AI_ALLOW_UNGUARDED_PROVIDER_IN_DEVELOPMENT === "true";
    if (testRuntime || explicitDevelopmentOverride) return input.invoke();
    throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "provider_call_without_admission");
  }
  if (admission.deadline) admission.deadline.allocate(input.stage || (input.purpose === "history_repair" ? "repair" : input.purpose === "history_review" || input.purpose === "history_rereview" ? "verification" : "answer_generation"), 1_000, input.reserveMs ?? (input.purpose === "history_repair" ? 8_000 : 0), 250);
  const call = await admission.beginProviderCall({ purpose: canonicalReviewPurpose(input.purpose), stage: input.stage || "answer_generation", input: input.providerInput, maxOutputTokens: input.maxOutputTokens, model: input.model });
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

/** All Ask phases share the operation deadline, including repair and re-review. */
export function boundedProviderTimeout(maximumMs: number, reserveMs = 0, stage: PipelineStage = "answer_generation"): number {
  const budget = getActiveAiAdmission()?.deadline;
  if (budget) return budget.allocate(stage, maximumMs, reserveMs, 250);
  const deadline = getActiveAiAdmission()?.providerDeadlineAt;
  const remaining = deadline === undefined ? maximumMs : Math.floor(deadline - Date.now()) - reserveMs;
  if (remaining <= 0) throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_deadline_exhausted");
  return Math.min(maximumMs, remaining);
}

/**
 * Admit and dispatch the same JSON request. This accounts for instructions,
 * schemas, tools and future request fields, not just the user input.
 * The existing chars/3 estimator and feature ceilings remain unchanged:
 * this is an accounting policy estimate, not measured provider token usage.
 */
export async function executeAdmittedResponsesRequest<R extends Record<string, unknown>, T>(input: {
  purpose?: ProviderCallPurpose;
  catalogAuthorization?: CatalogContinuationToken;
  invoke: (request: R) => Promise<T>;
  reserveMs?: number;
  stage?: PipelineStage;
  maxOutputTokens: number;
  model: string;
  request: R;
}) {
  // Snapshot before any asynchronous admission. The SDK receives this exact
  // JSON value even if a caller later changes its original request.
  const request = JSON.parse(JSON.stringify(input.request)) as R;
  if (!request || Array.isArray(request) || typeof request !== "object"
    || request.model !== input.model || request.max_output_tokens !== input.maxOutputTokens
    || !Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0) {
    throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_request_contract_mismatch");
  }
  freezeProviderRequest(request);
  return executeAdmittedProviderCall({
    purpose: input.purpose, catalogAuthorization: input.catalogAuthorization, reserveMs: input.reserveMs, stage: input.stage,
    model: input.model, maxOutputTokens: input.maxOutputTokens,
    providerInput: request, invoke: () => input.invoke(request),
  });
}

function freezeProviderRequest(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) freezeProviderRequest(child);
  Object.freeze(value);
}
