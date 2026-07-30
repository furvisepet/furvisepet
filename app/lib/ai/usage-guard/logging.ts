import type { AiGuardFeature } from "./types";

export function logAiGuardEvent(event: string, input: {
  actualInputTokens?: number; actualOutputTokens?: number; allowed?: boolean; callNumber?: number;
  dailyCallCount?: number; dailyCostMicrodollars?: number; denialReason?: string; durationMs?: number;
  emergencyDisabled?: boolean; estimatedInputTokens?: number; feature: AiGuardFeature; model?: string;
  operationId: string; reconciledCostMicrodollars?: number; requestId: string; reservedCostMicrodollars?: number;
  safeErrorClass?: string; userCreditState?: "completed" | "limit_reached" | "released" | "reserved" | "reused";
}) {
  const payload = { event, ...input };
  if (input.allowed === false || input.safeErrorClass) console.warn("[Furvise AI guard]", payload);
  else console.info("[Furvise AI guard]", payload);
}
