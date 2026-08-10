import type { SupabaseClient } from "@supabase/supabase-js";
import { recordActiveAiUserCreditState } from "./usage-guard/context.ts";
import { getPlanCapabilities, type PlanId } from "../billing/plan-limits.ts";

export const AI_USAGE_EVENTS_TABLE = "ai_usage_events";

export type AiFeature =
  | "ask"
  | "product_question"
  | "product_query"
  | "product_explanation"
  | "safety_followup"
  | "vet_brief"
  | "care_plan";

export type AiCreditStatus = {
  allowed: boolean;
  count: number;
  ledgerMode?: "database" | "development_missing_migration";
  limit: number;
  monthKey: string;
  planId: PlanId;
  remaining: number;
};

export type AiCreditReservation = {
  creditsUsed: number;
  remaining: number;
  status: "reserved" | "completed" | "released" | "limit_reached";
};

type LedgerRpcRow = {
  reservation_status?: string;
  event_status?: string;
  credits_used?: number;
  remaining?: number;
};

type SupabaseErrorDetails = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

export function getAiPeriodStart(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function getAiMonthKey(date = new Date()) {
  return getAiPeriodStart(date).slice(0, 7);
}

export function getMonthlyAiAllowance(_userId: string, planId: PlanId = "free", entitlementLimit?: number) {
  return typeof entitlementLimit === "number" && Number.isInteger(entitlementLimit) && entitlementLimit > 0
    ? entitlementLimit
    : getPlanCapabilities(planId).aiCreditsMonthlyLimit;
}

export async function getMonthlyAiUsage({
  periodStart = getAiPeriodStart(),
  supabase,
  userId,
}: {
  periodStart?: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data, error } = await supabase
    .from(AI_USAGE_EVENTS_TABLE)
    .select("credits_used")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("status", "completed")
    .returns<Array<{ credits_used: number }>>();
  if (error) throw new AiCreditLedgerError("usage_read_failed", error, AI_USAGE_EVENTS_TABLE, "select");
  return (data || []).reduce((total, event) => total + Math.max(0, event.credits_used || 0), 0);
}

export async function getRemainingAiCredits({
  monthlyAiCredits,
  planId = "free",
  supabase,
  userId,
}: {
  monthlyAiCredits?: number;
  planId?: PlanId;
  supabase: SupabaseClient;
  userId: string;
}): Promise<AiCreditStatus> {
  const limit = getMonthlyAiAllowance(userId, planId, monthlyAiCredits);
  const count = await getMonthlyAiUsage({ supabase, userId });
  const remaining = Math.max(0, limit - count);
  return { allowed: remaining > 0, count, ledgerMode: "database", limit, monthKey: getAiMonthKey(), planId, remaining };
}

export async function reserveAiCredit({
  feature,
  requestId,
  supabase,
}: {
  feature: AiFeature;
  requestId: string;
  supabase: SupabaseClient;
}): Promise<AiCreditReservation> {
  const { data, error } = await supabase.rpc("reserve_ai_credit", {
    p_feature: feature,
    p_request_id: requestId,
  });
  if (error) throw new AiCreditLedgerError("reservation_failed", error, "reserve_ai_credit", "rpc");
  const result = parseLedgerResult(data, "reservation_status");
  recordActiveAiUserCreditState(result.status === "completed" ? "reused" : result.status);
  return result;
}

export async function completeAiCredit({
  requestId,
  supabase,
}: {
  requestId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("complete_ai_credit", {
    p_request_id: requestId,
  });
  if (error) throw new AiCreditLedgerError("completion_failed", error, "complete_ai_credit", "rpc");
  const result = parseLedgerResult(data, "event_status");
  recordActiveAiUserCreditState(result.status === "completed" ? "completed" : result.status === "released" ? "released" : "reserved");
  return result;
}

export async function releaseAiCredit({
  requestId,
  supabase,
}: {
  requestId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("release_ai_credit", {
    p_request_id: requestId,
  });
  if (error) throw new AiCreditLedgerError("release_failed", error, "release_ai_credit", "rpc");
  const result = parseLedgerResult(data, "event_status");
  recordActiveAiUserCreditState(result.status === "released" ? "released" : result.status === "completed" ? "completed" : "reserved");
  return result;
}

export class AiCreditLedgerError extends Error {
  stage: "usage_read_failed" | "reservation_failed" | "completion_failed" | "release_failed";
  cause: unknown;
  operation: "select" | "rpc";
  resource: string;

  constructor(stage: AiCreditLedgerError["stage"], cause: unknown, resource: string, operation: AiCreditLedgerError["operation"]) {
    super("Furvise could not update AI credits.");
    this.name = "AiCreditLedgerError";
    this.stage = stage;
    this.cause = cause;
    this.operation = operation;
    this.resource = resource;
  }
}

export function getAiCreditLedgerDiagnostic(error: unknown) {
  const ledgerError = error instanceof AiCreditLedgerError ? error : null;
  const cause = (ledgerError?.cause || error) as SupabaseErrorDetails | null;
  return {
    code: typeof cause?.code === "string" ? cause.code : "",
    details: typeof cause?.details === "string" ? cause.details : "",
    hint: typeof cause?.hint === "string" ? cause.hint : "",
    message: typeof cause?.message === "string" ? cause.message : error instanceof Error ? error.message : "Unknown error",
    operation: ledgerError?.operation || "",
    resource: ledgerError?.resource || "",
    stage: ledgerError?.stage || "",
  };
}

export function isMissingAiUsageTableError(error: unknown) {
  const diagnostic = getAiCreditLedgerDiagnostic(error);
  if (diagnostic.resource !== AI_USAGE_EVENTS_TABLE || diagnostic.operation !== "select") return false;
  const text = `${diagnostic.message} ${diagnostic.details} ${diagnostic.hint}`.toLowerCase();
  return (diagnostic.code === "42P01" || diagnostic.code === "PGRST205") &&
    (text.includes("ai_usage_events") || text.includes("schema cache") || text.includes("relation"));
}

export function buildDevelopmentAiCreditFallback(planId: PlanId): AiCreditStatus {
  return {
    allowed: true,
    count: 0,
    ledgerMode: "development_missing_migration",
    limit: 50,
    monthKey: getAiMonthKey(),
    planId,
    remaining: 50,
  };
}

export class AiCreditLimitReachedError extends Error {
  constructor() {
    super("AI_CREDIT_LIMIT_REACHED");
    this.name = "AiCreditLimitReachedError";
  }
}

export async function runWithAiCredit<T>({
  beforeComplete,
  feature,
  generate,
  monthlyAiCredits,
  planId = "free",
  requestId,
  supabase,
  userId,
}: {
  beforeComplete?: (value: T) => Promise<void>;
  feature: AiFeature;
  generate: () => Promise<T>;
  monthlyAiCredits?: number;
  planId?: PlanId;
  requestId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const reservation = await reserveAiCredit({ feature, requestId, supabase });
  if (reservation.status === "limit_reached") throw new AiCreditLimitReachedError();
  try {
    const value = await generate();
    if (beforeComplete) await beforeComplete(value);
    if (reservation.status !== "completed") {
      try {
        await completeAiCredit({ requestId, supabase });
      } catch {
        await completeAiCredit({ requestId, supabase });
      }
    }
    const usage = await getRemainingAiCredits({ monthlyAiCredits, planId, supabase, userId });
    return { creditsUsed: reservation.status === "completed" ? 0 : 1, usage, value };
  } catch (error) {
    if (reservation.status === "reserved") {
      try { await releaseAiCredit({ requestId, supabase }); } catch { /* The provider error remains the actionable failure. */ }
    }
    throw error;
  }
}

function parseLedgerResult(data: unknown, statusKey: "reservation_status" | "event_status"): AiCreditReservation {
  const row = (Array.isArray(data) ? data[0] : data) as LedgerRpcRow | null;
  const rawStatus = row?.[statusKey];
  const status = rawStatus === "completed" || rawStatus === "released" || rawStatus === "limit_reached"
    ? rawStatus
    : "reserved";
  return {
    creditsUsed: typeof row?.credits_used === "number" ? row.credits_used : status === "released" || status === "limit_reached" ? 0 : 1,
    remaining: typeof row?.remaining === "number" ? Math.max(0, row.remaining) : 0,
    status,
  };
}
