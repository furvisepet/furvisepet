import "server-only";
import { ASK_OPERATION_TIMEOUT_MS } from "../ask-execution-limits.ts";

import { randomUUID } from "node:crypto";
import { ASK_BUNDLE_SLOTS, ASK_BUNDLE_OUTPUT_CEILING } from "./whole-ask-reservation.ts";
import { getRateLimitBackendConfig } from "../../security/rate-limit/config";
import { fingerprintRateLimitPayload } from "../../security/rate-limit/keys";
import { OPENAI_ANALYSIS_MODEL } from "../config";
import { requireApprovedAiModel } from "../model-policy";
import { getAiGuardConfig, isAiFeatureEnabled } from "./config";
import { estimateInputTokens, estimateProviderCostMicrodollars, getModelPrice } from "./cost-estimator";
import { getConfiguredAiGuardStore, secondsUntilUtcBucketExpiry, utcDay } from "./daily-usage-store";
import { AiAdmissionError } from "./errors";
import { getAiFeaturePolicy } from "./features";
import { logAiGuardEvent } from "./logging";
import { noopAiGuardMetrics } from "./types";
import { OperationDeadline } from "../execution-deadline.ts";
import { deriveAiGuardOperationId } from "./operation-identity";
import type { AiCallReservation, AiGuardFeature, AiGuardMetrics, AiGuardStore, ProviderUsage } from "./types";
import { runWithAiAdmission } from "./context";

export async function admitAiOperation(input: {
  deadline?: OperationDeadline;
  env?: Record<string, string | undefined>; feature: AiGuardFeature; intendedModel?: string; metrics?: AiGuardMetrics;
  now?: Date; operationTtlSeconds?: number; payload: unknown; requestId: string; store?: AiGuardStore; userId: string;
}) {
  const startedAt = Date.now();
  const env = input.env || process.env;
  const config = getAiGuardConfig(env, true);
  const policy = getAiFeaturePolicy(input.feature);
  const intendedModel = input.intendedModel || OPENAI_ANALYSIS_MODEL;
  requireApprovedAiModel(intendedModel);
  const deny = async (code: ConstructorParameters<typeof AiAdmissionError>[0], reason: string, status = 503) => {
    logAiGuardEvent("admission denied", { allowed: false, denialReason: reason, durationMs: Date.now() - startedAt, feature: input.feature, model: intendedModel, operationId: "denied", requestId: input.requestId });
    await safeMetric(input.metrics || noopAiGuardMetrics, { allowed: false, durationMs: Date.now() - startedAt, feature: input.feature, reason });
    throw new AiAdmissionError(code, reason, status);
  };
  if (!config.enabled) return deny("AI_TEMPORARILY_UNAVAILABLE", "global_disabled");
  if (!isAiFeatureEnabled(input.feature, env)) return deny("AI_FEATURE_UNAVAILABLE", "feature_disabled");
  if (!config.configured) return deny("AI_TEMPORARILY_UNAVAILABLE", "daily_guard_not_configured");
  if (config.qualificationMode && config.qualificationLimitMicrodollars <= 0) return deny("AI_TEMPORARILY_UNAVAILABLE", "qualification_total_budget_unconfigured");
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
  const operationId = deriveAiGuardOperationId({ feature: input.feature, requestId: input.requestId, secret, userId: input.userId });
  const operationKey = `furvise:ai:v1:operation:${operationId}`;
  const operationTtlSeconds = input.operationTtlSeconds || config.operationTtlSeconds;
  const fingerprint = fingerprintRateLimitPayload({ feature: input.feature, payload: input.payload });
  let operationState;
  try { operationState = await store.admitOperation({ fingerprint, key: operationKey, ttlSeconds: operationTtlSeconds }); }
  catch { return deny("AI_TEMPORARILY_UNAVAILABLE", "operation_store_unavailable"); }
  if (operationState === "conflict") return deny("AI_OPERATION_CONFLICT", "operation_payload_conflict", 409);
  if (operationState === "completed") return deny("AI_PROVIDER_BUDGET_EXHAUSTED", "completed_operation_replay_required", 409);
  if (config.wholeAskQualification && input.feature === "ask" && operationState !== "created")
    return deny("AI_OPERATION_CONFLICT", "whole_ask_duplicate_operation", 409);

  const admission = new AiOperationAdmission({ deadline: input.deadline, config, env, feature: input.feature, intendedModel, metrics: input.metrics || noopAiGuardMetrics, now: input.now || new Date(), operationId, operationKey, operationTtlSeconds, policy, requestId: input.requestId, store });
  try {
    if (config.wholeAskQualification && input.feature === "ask") await admission.reserveWholeAsk();
    else await admission.reserveNextCall(intendedModel);
  }
  catch (error) { await store.failOperation({ key: operationKey, ttlSeconds: operationTtlSeconds }).catch(() => {}); throw error; }
  logAiGuardEvent("operation admitted", { allowed: true, emergencyDisabled: false, feature: input.feature, model: intendedModel, operationId, requestId: input.requestId });
  await safeMetric(input.metrics || noopAiGuardMetrics, { allowed: true, durationMs: Date.now() - startedAt, feature: input.feature, reason: "admitted" });
  return admission;
}

export class AiOperationAdmission {
  readonly deadline: OperationDeadline | null;
  // The shared operation deadline includes persistence and settlement.
  readonly providerDeadlineAt: number;
  private callNumber = 0;
  private interpretationRepaired = false;
  private generationRepaired = false;
  private lastPurpose: string | undefined;
  private lastStage: string | undefined;
  private catalogTerminal = false;
  private historyRepairStarted = false;
  private queued: AiCallReservation | null = null;
  private bundleRemaining: AiCallReservation[] | null = null;
  readonly wholeAskPrepaid: boolean;
  private readonly config: ReturnType<typeof getAiGuardConfig>;
  private readonly env: Record<string, string | undefined>;
  readonly feature: AiGuardFeature;
  private readonly intendedModel: string;
  private readonly metrics: AiGuardMetrics;
  private readonly now: Date;
  readonly operationId: string;
  private readonly operationKey: string;
  private readonly operationTtlSeconds: number;
  private readonly policy: ReturnType<typeof getAiFeaturePolicy>;
  readonly requestId: string;
  private readonly store: AiGuardStore;

  constructor(input: { deadline?: OperationDeadline; config: ReturnType<typeof getAiGuardConfig>; env: Record<string, string | undefined>; feature: AiGuardFeature; intendedModel: string; metrics: AiGuardMetrics; now: Date; operationId: string; operationKey: string; operationTtlSeconds: number; policy: ReturnType<typeof getAiFeaturePolicy>; requestId: string; store: AiGuardStore }) {
    Object.assign(this, input);
    this.deadline = input.feature === "ask" ? input.deadline || new OperationDeadline(ASK_OPERATION_TIMEOUT_MS) : null;
    this.providerDeadlineAt = input.feature === "ask" ? Date.now() + ASK_OPERATION_TIMEOUT_MS : Number.POSITIVE_INFINITY;
    this.wholeAskPrepaid = input.config.wholeAskQualification && input.feature === "ask";
    this.config = input.config; this.env = input.env; this.feature = input.feature; this.intendedModel = input.intendedModel;
    this.metrics = input.metrics; this.now = input.now; this.operationId = input.operationId; this.operationKey = input.operationKey; this.operationTtlSeconds = input.operationTtlSeconds;
    this.policy = input.policy; this.requestId = input.requestId; this.store = input.store;
  }

  async reserveWholeAsk() {
    if (!this.wholeAskPrepaid || !this.store.reserveWholeAsk) {
      throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "whole_ask_store_unavailable");
    }
    const price = estimateProviderCostMicrodollars(this.intendedModel, {
      inputTokens: Math.max(this.policy.maxInputTokens, this.policy.maxInputCharacters * 4 + 2_048),
      outputTokens: ASK_BUNDLE_OUTPUT_CEILING,
    });
    if (price === null || price < 1) throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "whole_ask_price_unavailable");
    const ids = Array.from({ length: ASK_BUNDLE_SLOTS }, () => this.operationId + ":" + randomUUID());
    let result;
    try {
      result = await this.store.reserveWholeAsk({
        callIds: ids, operationId: this.operationId, day: utcDay(this.now),
        ttlSeconds: secondsUntilUtcBucketExpiry(this.now),
        operationTtlSeconds: this.operationTtlSeconds, callLimit: this.config.callLimit,
        costLimitMicrodollars: this.config.costLimitMicrodollars,
        qualificationLimitMicrodollars: this.config.qualificationLimitMicrodollars,
        perCallMicrodollars: price,
      });
    } catch {
      throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "whole_ask_accounting_unavailable");
    }
    if (!result.allowed) throw new AiAdmissionError("AI_DAILY_CAP_REACHED", result.reason);
    this.bundleRemaining = ids.map((callId, index) => ({
      callId, callNumber: index + 1, day: utcDay(this.now), feature: "ask",
      operationId: this.operationId, reservedCostMicrodollars: price,
    }));
    await this.reserveNextCall(this.intendedModel);
  }

  async run<T>(action: () => Promise<T>) { return runWithAiAdmission(this, action); }

  assertCatalogPlanningPhase() {
    if (this.catalogTerminal || this.feature !== "ask" || this.callNumber !== 1 || this.queued || this.lastPurpose !== undefined || this.lastStage !== "interpretation"
      || this.interpretationRepaired || this.generationRepaired || this.historyRepairStarted)
      throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "catalog_phase_out_of_order");
  }

  async beginProviderCall(input: { purpose?: "catalog_continuation" | "interpretation_repair" | "generation_repair" | "history_review" | "history_repair" | "history_rereview"; input: unknown; maxOutputTokens: number; model: string; stage?: string }) {
    requireApprovedAiModel(input.model);
    if (this.catalogTerminal) throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "catalog_terminal");
    if (this.deadline ? this.deadline.remainingMs() <= 0 : Date.now() >= this.providerDeadlineAt) throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_deadline_exhausted");
    if (this.queued && (input.purpose === "catalog_continuation" || input.purpose === "interpretation_repair" || input.purpose === "generation_repair" || input.purpose === "history_repair" || input.purpose === "history_rereview"))
      throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_phase_out_of_order");
    const estimatedInputTokens = estimateInputTokens(input.input);
    if (this.wholeAskPrepaid && input.maxOutputTokens > ASK_BUNDLE_OUTPUT_CEILING)
      throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "whole_ask_output_ceiling");
    if (estimatedInputTokens > this.policy.maxInputTokens || JSON.stringify(input.input).length > this.policy.maxInputCharacters || input.maxOutputTokens > this.policy.maxOutputTokens) {
      throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "feature_token_budget_exceeded");
    }
    if (!getModelPrice(input.model) && !(this.config.production === false && this.env.FURVISE_AI_ALLOW_UNKNOWN_MODEL_IN_DEVELOPMENT === "true")) throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "unknown_model_pricing");
    if (!this.queued || input.model !== this.intendedModel) {
      if (this.queued) await this.releaseQueued();
      await this.reserveNextCall(input.model, input.purpose);
    }
    const reservation = this.queued!;
    this.queued = null;
    // Latch before dispatch bookkeeping: an uncertain start cannot reopen another phase.
    if (input.purpose === "catalog_continuation") this.catalogTerminal = true;
    try { await this.store.markCallStarted({ callId: reservation.callId }); }
    catch { throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "call_start_accounting_uncertain"); }
    logAiGuardEvent("provider call started", { allowed: true, callNumber: reservation.callNumber, estimatedInputTokens, feature: this.feature, model: input.model, operationId: this.operationId, requestId: this.requestId, reservedCostMicrodollars: reservation.reservedCostMicrodollars });
    if (input.purpose === "interpretation_repair") this.interpretationRepaired = true;
    if (input.purpose === "generation_repair") this.generationRepaired = true;
    this.lastPurpose = input.purpose;
    this.lastStage = input.stage;
    if (input.purpose === "history_repair") this.historyRepairStarted = true;
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

  private async releaseRemainingBundle() {
    const pending = this.bundleRemaining || [];
    this.bundleRemaining = [];
    for (const item of pending) await this.store.releaseUnstartedCall({ callId: item.callId });
  }
  async complete() { await this.releaseQueued(); await this.releaseRemainingBundle(); await this.store.completeOperation({ key: this.operationKey, ttlSeconds: this.operationTtlSeconds }); }
  async fail(error?: unknown) { await this.releaseQueued(); await this.releaseRemainingBundle(); await this.store.failOperation({ key: this.operationKey, ttlSeconds: this.operationTtlSeconds }).catch(() => {}); if (error) logAiGuardEvent("operation failed", { allowed: false, denialReason: error instanceof AiAdmissionError ? error.reason : "operation_failed", feature: this.feature, operationId: this.operationId, requestId: this.requestId, safeErrorClass: error instanceof Error ? error.name : "UnknownError" }); }
  async release() { await this.releaseQueued(); await this.releaseRemainingBundle(); }

  async reserveNextCall(model: string, purpose?: "catalog_continuation" | "interpretation_repair" | "generation_repair" | "history_review" | "history_repair" | "history_rereview") {
    requireApprovedAiModel(model);
    if (this.catalogTerminal) throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "catalog_terminal");
    if (purpose === "catalog_continuation") this.assertCatalogPlanningPhase();
    if (this.feature === "ask" && purpose === "interpretation_repair" && (this.callNumber !== 1 || this.interpretationRepaired)) {
      throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_phase_out_of_order");
    }
    if (this.feature === "ask" && (purpose === "generation_repair"
      && (this.callNumber !== 2 || this.interpretationRepaired || this.generationRepaired || this.lastPurpose !== undefined)
      || this.generationRepaired && purpose !== "history_review" && purpose !== "history_repair" && purpose !== "history_rereview")) {
      throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_phase_out_of_order");
    }
    // Repair is a separate, one-use phase after the initial review. The final
    // review cannot open another repair cycle; the store also caps all attempts.
    if (this.feature === "ask" && (purpose === "history_repair" && (this.lastPurpose !== "history_review" || this.historyRepairStarted)
      || purpose === "history_rereview" && this.lastPurpose !== "history_repair"
      || purpose === "history_review" && (this.lastPurpose === "history_review" || this.historyRepairStarted))) {
      throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_phase_out_of_order");
    }
    // Structural repair does not replace semantic review. Each is single-use;
    // reserve the final independent review before admitting an answer repair.
    const structuralRepairCalls = Number(this.interpretationRepaired || this.generationRepaired);
    const maximumCalls = this.feature !== "ask" ? this.policy.maximumProviderCalls
      : purpose === "history_rereview" ? 5 + structuralRepairCalls
      : purpose === "history_repair" ? 4 + structuralRepairCalls
      : purpose === "history_review" ? 3 + structuralRepairCalls
      : purpose === "generation_repair" ? 3 : 2 + Number(this.interpretationRepaired);
    if (this.callNumber >= maximumCalls) throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "provider_call_budget_exhausted");
    // Qualification reserves the feature's full input/output ceilings, not an
    // average chars/3 estimate. The UTF-16 character ceiling bounds the
    // serialized text even when tokenization is much denser than estimated.
    if (this.bundleRemaining !== null) {
      const reservation = this.bundleRemaining.shift();
      if (!reservation) throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "whole_ask_slots_exhausted");
      this.callNumber = reservation.callNumber;
      this.queued = reservation;
      return;
    }
    const ceilingInputTokens = this.config.qualificationMode
      ? Math.max(this.policy.maxInputTokens, this.policy.maxInputCharacters * 4 + 2_048)
      : this.policy.maxInputTokens;
    const ceilingOutputTokens = this.policy.maxOutputTokens;
    const reservedCost = this.config.qualificationMode
      ? estimateProviderCostMicrodollars(model, { inputTokens: ceilingInputTokens, outputTokens: ceilingOutputTokens })
      : estimateProviderCostMicrodollars(model, { inputTokens: this.policy.maxInputTokens, outputTokens: this.policy.maxOutputTokens });
    if (reservedCost === null) throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "unknown_model_pricing");
    const nextNumber = this.callNumber + 1;
    const callId = `${this.operationId}:${randomUUID()}`;
    let result;
    try {
      result = await this.store.reserveCall({ callId, callLimit: this.config.callLimit, costLimitMicrodollars: this.config.costLimitMicrodollars, day: utcDay(this.now), feature: this.feature, maximumOperationCalls: maximumCalls, operationCallTtlSeconds: this.operationTtlSeconds, operationId: this.operationId, reservedCostMicrodollars: reservedCost, ttlSeconds: secondsUntilUtcBucketExpiry(this.now), qualificationLimitMicrodollars: this.config.qualificationLimitMicrodollars });
    } catch {
      logAiGuardEvent("provider call denied", {
        allowed: false,
        callNumber: nextNumber,
        denialReason: "daily_guard_store_unavailable",
        feature: this.feature,
        model,
        operationId: this.operationId,
        requestId: this.requestId,
        reservedCostMicrodollars: reservedCost,
        safeErrorClass: "AiAdmissionError",
      });
      throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "daily_guard_store_unavailable");
    }
    if (!result.allowed) {
      logAiGuardEvent("provider call denied", {
        allowed: false,
        callNumber: nextNumber,
        dailyCallCount: result.snapshot.calls,
        dailyCostMicrodollars: result.snapshot.costMicrodollars,
        denialReason: result.reason,
        feature: this.feature,
        model,
        operationId: this.operationId,
        requestId: this.requestId,
        reservedCostMicrodollars: reservedCost,
        safeErrorClass: "AiAdmissionError",
      });
      if (result.reason === "operation_call_limit") throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", result.reason);
      throw new AiAdmissionError("AI_DAILY_CAP_REACHED", result.reason);
    }
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
