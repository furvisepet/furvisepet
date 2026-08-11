export type AiGuardFeature = "ask" | "care_plan" | "product_explanation" | "product_query" | "product_question" | "safety_followup" | "vet_brief";

export type AiFeaturePolicy = {
  envFlag: string;
  feature: AiGuardFeature;
  maxInputCharacters: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maximumProviderCalls: number;
};

export type AiModelPrice = {
  cachedInputMicrodollarsPerMillionTokens: number | null;
  effectiveDate: string;
  inputMicrodollarsPerMillionTokens: number;
  model: string;
  outputMicrodollarsPerMillionTokens: number;
  source: string;
};

export type ProviderUsage = { cachedInputTokens?: number; inputTokens: number; outputTokens: number };

export type AiDailySnapshot = { calls: number; costMicrodollars: number };

export type AiCallReservation = {
  callId: string;
  callNumber: number;
  day: string;
  feature: AiGuardFeature;
  operationId: string;
  reservedCostMicrodollars: number;
};

export type AiGuardStore = {
  admitOperation(input: { fingerprint: string; key: string; ttlSeconds: number }): Promise<"created" | "reused" | "conflict" | "completed">;
  completeOperation(input: { key: string; ttlSeconds: number }): Promise<void>;
  failOperation(input: { key: string; ttlSeconds: number }): Promise<void>;
  emergencyStatus(): Promise<{ disabled: boolean; reason: string | null; updatedAt: string | null }>;
  reserveCall(input: {
    callId: string; callLimit: number; costLimitMicrodollars: number; day: string; feature: AiGuardFeature;
    maximumOperationCalls: number; operationId: string; reservedCostMicrodollars: number; ttlSeconds: number;
  }): Promise<{ allowed: true; reused: boolean; snapshot: AiDailySnapshot } | { allowed: false; reason: "daily_call_limit" | "daily_cost_limit" | "operation_call_limit"; snapshot: AiDailySnapshot }>;
  markCallStarted(input: { callId: string }): Promise<void>;
  reconcileCall(input: { actualCostMicrodollars: number; callId: string }): Promise<AiDailySnapshot>;
  releaseUnstartedCall(input: { callId: string }): Promise<void>;
};

export type AiGuardMetric = { allowed: boolean; feature: AiGuardFeature; reason: string; durationMs: number };
export type AiGuardMetrics = { record(metric: AiGuardMetric): void | Promise<void> };
