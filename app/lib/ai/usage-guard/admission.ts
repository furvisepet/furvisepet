import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { getRateLimitBackendConfig } from "../../security/rate-limit/config";
import { fingerprintRateLimitPayload } from "../../security/rate-limit/keys";
import { OPENAI_ANALYSIS_MODEL } from "../config";
import { getAiGuardConfig, isAiFeatureEnabled } from "./config";
import { estimateInputTokens, estimateProviderCostMicrodollars, getModelPrice } from "./cost-estimator";
import { getConfiguredAiGuardStore, secondsUntilUtcBucketExpiry, utcDay } from "./daily-usage-store";
import { AiAdmissionError } from "./errors";
import { getAiFeaturePolicy } from "./features";
import { logAiGuardEvent } from "./logging";
import { noopAiGuardMetrics } from "./metrics";
import type { AiCallReservation, AiGuardFeature, AiGuardMetrics, AiGuardStore, ProviderUsage } from "./types";
import { runWithAiAdmission } from "./context";

export async function admitAiOperation(input: {
  env?: Record<string, string | undefined>; feature: AiGuardFeature; intendedModel?: string; metrics?: AiGuardMetrics;
  now?: Date; payload: unknown; requestId: string; store?: AiGuardStore; userId: string;
}) {
  const startedAt = Date.now();
  const env = input.env || process.env;
  const config = getAiGuardConfig(env);
  const policy = getAiFeaturePolicy(input.feature);
  const intendedModel = input.intendedModel || OPENAI_ANALYSIS_MODEL;
  const deny = async (code: ConstructorParameters<typeof AiAdmissionError>[0], reason: string, status = 503) => {
    logAiGuardEvent("admission denied", { allowed: false, denialReason: reason, durationMs: Date.now() - startedAt, feature: input.feature, model: intendedModel, operationId: "denied", requestId: input.requestId });
    await safeMetric(input.metrics || noopAiGuardMetrics, { allowed: false, durationMs: Date.now() - startedAt, feature: input.feature, reason });
    throw new AiAdmissionError(code, reason, status);
  };
  if (!config.enabled) return deny("AI_TEMPORARILY_UNAVAILABLE", "global_disabled");
  if (!isAiFeatureEnabled(input.feature, env)) return deny("AI_FEATURE_UNAVAILABLE", "feature_disabled");
  if (!config.configured) return deny("AI_TEMPORARILY_UNAVAILABLE", "daily_guard_not_configured");
  if (!getModelPrice(intendedModel) && !(config.production === false && env.FURVISE_AI_ALLOW_UNKNOWN_MODEL_IN_DEVELOPMENT === "true")) return deny("AI_TEMPORARILY_UNAVAILABLE", "unknown_model_pricing");
  const backend = getRateLimitBackendConfig(env as NodeJS.ProcessEnv);
  const store = input.store || getConfiguredAiGuardStore();
  if (!store || (!input.store && !backend.configured)) return deny("AI_TEMPORARILY_UNAVAILABLE", "guard_store_unavailable");
  let emergency;
  try { emergency = await store.emergencyStatus(); }
  catch { return deny("AI_TEMPORARILY_UNAVAILABLE", "emergency_state_unavailable"); }
  if (emergency.disabled) return deny("AI_TEMPORARILY_UNAVAILABLE", "emergency_disabled");

  const secret = backend.hashSecret || (input.store ? "usage-guard-test-secret-at-least-32-characters" : "");
  if (secret.length < 32) return deny("AI_TEMPORARILY_UNAVAILABLE", "identity_secret_unavailable");
  const operationId = createHmac("sha256", secret).update(`${input.userId}:${input.requestId}`).digest("hex");
  const operationKey = `furvise:ai:v1:operation:${operationId}`;
  const fingerprint = fingerprintRateLimitPayload({ feature: input.feature, payload: input.payload });
  let operationState;
  try { operationState = await store.admitOperation({ fingerprint, key: operationKey, ttlSeconds: config.operationTtlSeconds }); }
  catch { return deny("AI_TEMPORARILY_UNAVAILABLE", "operation_store_unavailable"); }
  if (operationState === "conflict") return deny("AI_OPERATION_CONFLICT", "operation_payload_conflict", 409);
  if (operationState === "completed") return deny("AI_PROVIDER_BUDGET_EXHAUSTED", "completed_operation_replay_required", 409);

  const admission = new AiOperationAdmission({ config, env, feature: input.feature, intendedModel, metrics: input.metrics || noopAiGuardMetrics, now: input.now || new Date(), operationId, operationKey, policy, requestId: input.requestId, store });
  try { await admission.reserveNextCall(intendedModel); }
  catch (error) { await store.failOperation({ key: operationKey, ttlSeconds: config.operationTtlSeconds }).catch(() => {}); throw error; }
  logAiGuardEvent("operation admitted", { allowed: true, emergencyDisabled: false, feature: input.feature, model: intendedModel, operationId, requestId: input.requestId });
  await safeMetric(input.metrics || noopAiGuardMetrics, { allowed: true, durationMs: Date.now() - startedAt, feature: input.feature, reason: "admitted" });
  return admission;
}

export class AiOperationAdmission {
  private callNumber = 0;
  private queued: AiCallReservation | null = null;
  private readonly config: ReturnType<typeof getAiGuardConfig>;
  private readonly env: Record<string, string | undefined>;
  readonly feature: AiGuardFeature;
  private readonly intendedModel: string;
  private readonly metrics: AiGuardMetrics;
  private readonly now: Date;
  readonly operationId: string;
  private readonly operationKey: string;
  private readonly policy: ReturnType<typeof getAiFeaturePolicy>;
  readonly requestId: string;
  private readonly store: AiGuardStore;

  constructor(input: { config: ReturnType<typeof getAiGuardConfig>; env: Record<string, string | undefined>; feature: AiGuardFeature; intendedModel: string; metrics: AiGuardMetrics; now: Date; operationId: string; operationKey: string; policy: ReturnType<typeof getAiFeaturePolicy>; requestId: string; store: AiGuardStore }) {
    Object.assign(this, input);
    this.config = input.config; this.env = input.env; this.feature = input.feature; this.intendedModel = input.intendedModel;
    this.metrics = input.metrics; this.now = input.now; this.operationId = input.operationId; this.operationKey = input.operationKey;
    this.policy = input.policy; this.requestId = input.requestId; this.store = input.store;
  }

  async run<T>(action: () => Promise<T>) { return runWithAiAdmission(this, action); }

  async beginProviderCall(input: { input: unknown; maxOutputTokens: number; model: string }) {
    const estimatedInputTokens = estimateInputTokens(input.input);
    if (estimatedInputTokens > this.policy.maxInputTokens || JSON.stringify(input.input).length > this.policy.maxInputCharacters || input.maxOutputTokens > this.policy.maxOutputTokens) {
      throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "feature_token_budget_exceeded");
    }
    if (!getModelPrice(input.model) && !(this.config.production === false && this.env.FURVISE_AI_ALLOW_UNKNOWN_MODEL_IN_DEVELOPMENT === "true")) throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "unknown_model_pricing");
    if (!this.queued || input.model !== this.intendedModel) {
      if (this.queued) await this.releaseQueued();
      await this.reserveNextCall(input.model);
    }
    const reservation = this.queued!;
    this.queued = null;
    try { await this.store.markCallStarted({ callId: reservation.callId }); }
    catch { throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "call_start_accounting_uncertain"); }
    logAiGuardEvent("provider call started", { allowed: true, callNumber: reservation.callNumber, estimatedInputTokens, feature: this.feature, model: input.model, operationId: this.operationId, requestId: this.requestId, reservedCostMicrodollars: reservation.reservedCostMicrodollars });
    return { estimatedInputTokens, reservation };
  }

  async recordProviderUsage(reservation: AiCallReservation, model: string, usage: ProviderUsage) {
    const actualCost = estimateProviderCostMicrodollars(model, usage);
    if (actualCost === null) throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "unknown_model_pricing");
    try {
      const snapshot = await this.store.reconcileCall({ actualCostMicrodollars: actualCost, callId: reservation.callId });
      logAiGuardEvent("provider call reconciled", { actualInputTokens: usage.inputTokens, actualOutputTokens: usage.outputTokens, allowed: true, callNumber: reservation.callNumber, dailyCallCount: snapshot.calls, dailyCostMicrodollars: snapshot.costMicrodollars, feature: this.feature, model, operationId: this.operationId, reconciledCostMicrodollars: actualCost, requestId: this.requestId, reservedCostMicrodollars: reservation.reservedCostMicrodollars });
    } catch {
      logAiGuardEvent("provider accounting uncertain", { allowed: false, callNumber: reservation.callNumber, denialReason: "reconciliation_failed", feature: this.feature, model, operationId: this.operationId, requestId: this.requestId, reservedCostMicrodollars: reservation.reservedCostMicrodollars, safeErrorClass: "AI_USAGE_RECONCILIATION_FAILED" });
      throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "provider_usage_reconciliation_failed");
    }
  }

  recordProviderFailure(reservation: AiCallReservation, model: string, error: unknown) {
    logAiGuardEvent("provider call failed after start", { allowed: false, callNumber: reservation.callNumber, denialReason: "provider_failed", feature: this.feature, model, operationId: this.operationId, requestId: this.requestId, reservedCostMicrodollars: reservation.reservedCostMicrodollars, safeErrorClass: error instanceof Error ? error.name : "UnknownError" });
  }

  recordUserCreditState(state: "completed" | "limit_reached" | "released" | "reserved" | "reused") {
    logAiGuardEvent("user credit state", { allowed: state !== "limit_reached", feature: this.feature, model: this.intendedModel, operationId: this.operationId, requestId: this.requestId, userCreditState: state });
  }

  async complete() { await this.releaseQueued(); await this.store.completeOperation({ key: this.operationKey, ttlSeconds: this.config.operationTtlSeconds }); }
  async fail(error?: unknown) { await this.releaseQueued(); await this.store.failOperation({ key: this.operationKey, ttlSeconds: this.config.operationTtlSeconds }).catch(() => {}); if (error) logAiGuardEvent("operation failed", { allowed: false, denialReason: "operation_failed", feature: this.feature, operationId: this.operationId, requestId: this.requestId, safeErrorClass: error instanceof Error ? error.name : "UnknownError" }); }
  async release() { await this.releaseQueued(); }

  async reserveNextCall(model: string) {
    if (this.callNumber >= this.policy.maximumProviderCalls) throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_call_budget_exhausted");
    const reservedCost = estimateProviderCostMicrodollars(model, { inputTokens: this.policy.maxInputTokens, outputTokens: this.policy.maxOutputTokens });
    if (reservedCost === null) throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "unknown_model_pricing");
    const nextNumber = this.callNumber + 1;
    const callId = `${this.operationId}:${randomUUID()}`;
    let result;
    try {
      result = await this.store.reserveCall({ callId, callLimit: this.config.callLimit, costLimitMicrodollars: this.config.costLimitMicrodollars, day: utcDay(this.now), feature: this.feature, maximumOperationCalls: this.policy.maximumProviderCalls, operationId: this.operationId, reservedCostMicrodollars: reservedCost, ttlSeconds: secondsUntilUtcBucketExpiry(this.now) });
    } catch { throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "daily_guard_store_unavailable"); }
    if (!result.allowed) throw new AiAdmissionError(result.reason === "cost_limit" || result.reason === "call_limit" ? "AI_DAILY_CAP_REACHED" : "AI_TEMPORARILY_UNAVAILABLE", result.reason);
    this.callNumber = nextNumber;
    this.queued = { callId, callNumber: nextNumber, day: utcDay(this.now), feature: this.feature, operationId: this.operationId, reservedCostMicrodollars: reservedCost };
    logAiGuardEvent("provider call reserved", { allowed: true, callNumber: nextNumber, dailyCallCount: result.snapshot.calls, dailyCostMicrodollars: result.snapshot.costMicrodollars, feature: this.feature, model, operationId: this.operationId, requestId: this.requestId, reservedCostMicrodollars: reservedCost });
  }

  private async releaseQueued() { if (!this.queued) return; const call = this.queued; this.queued = null; await this.store.releaseUnstartedCall({ callId: call.callId }).catch(() => {}); this.callNumber = Math.max(0, this.callNumber - 1); }
}

export { getActiveAiAdmission } from "./context";

export async function runAdmittedAiOperation<T>(input: Parameters<typeof admitAiOperation>[0], action: () => Promise<T>) {
  const admission = await admitAiOperation(input);
  try { const result = await admission.run(action); await admission.complete(); return result; }
  catch (error) { await admission.fail(error); throw error; }
  finally { await admission.release(); }
}

async function safeMetric(metrics: AiGuardMetrics, metric: Parameters<AiGuardMetrics["record"]>[0]) { try { await metrics.record(metric); } catch { /* Metrics never affect admission. */ } }
