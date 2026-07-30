import type { AiGuardFeature } from "./types";
import { emitOperationalEvent } from "../../operations/events";

export function logAiGuardEvent(event: string, input: {
  actualInputTokens?: number; actualOutputTokens?: number; allowed?: boolean; callNumber?: number;
  dailyCallCount?: number; dailyCostMicrodollars?: number; denialReason?: string; durationMs?: number;
  emergencyDisabled?: boolean; estimatedInputTokens?: number; feature: AiGuardFeature; model?: string;
  operationId: string; reconciledCostMicrodollars?: number; requestId: string; reservedCostMicrodollars?: number;
  safeErrorClass?: string; userCreditState?: "completed" | "limit_reached" | "released" | "reserved" | "reused";
}) {
  if (input.allowed === false || input.safeErrorClass) {
    const type = input.denialReason === "daily_call_limit" || input.denialReason === "daily_cost_limit" ? "ai_daily_cap_reached"
      : input.emergencyDisabled ? "ai_emergency_disabled" : input.safeErrorClass?.includes("RECONCILIATION") ? "provider_usage_reconciliation_failure" : "ai_admission_denied";
    emitOperationalEvent({ errorCode: input.safeErrorClass || input.denialReason, eventType: type, feature: input.feature,
      operationId: input.operationId, requestId: input.requestId, severity: type === "provider_usage_reconciliation_failure" ? "critical" : "high" });
  }
  const payload = { event, ...input };
  if (input.allowed === false || input.safeErrorClass) console.warn("[Furvise AI guard]", payload);
  else console.info("[Furvise AI guard]", payload);
}
