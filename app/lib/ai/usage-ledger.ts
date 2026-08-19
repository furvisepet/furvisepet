import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { recordActiveAiUserCreditState } from "./usage-guard/context.ts";
import { getPlanCapabilities, type PlanId } from "../billing/plan-limits.ts";
import { getAskAllowance } from "../billing/launch-plans.ts";

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
  billingPlan?: PlanId;
  cancelAtPeriodEnd?: boolean;
  count: number;
  ledgerMode?: "database" | "development_missing_migration";
  limit: number;
  monthKey: string;
  planId: PlanId;
  remaining: number;
  resetAt?: string;
  subscriptionStatus?: string;
};

export type AiCreditReservation = {
  creditsUsed: number;
  remaining: number;
  status: "reserved" | "completed" | "released" | "limit_reached";
};

export type AiCreditDisposition = "complete" | "release";

export type AiCreditEventState = {
  disposition: AiCreditDisposition | null;
  logicalRequestId: string;
  payloadHash: string | null;
  requestId: string;
  status: "reserved" | "completed" | "released";
};

type LedgerRpcRow = {
  reservation_status?: string;
  event_status?: string;
  settlement_disposition?: string;
  credits_used?: number;
  remaining?: number;
};

type AskAllowanceRpcRow = {
  allowance?: number;
  billing_plan?: string;
  cancel_at_period_end?: boolean;
  effective_plan?: string;
  period_end?: string;
  period_start?: string;
  remaining?: number;
  subscription_status?: string;
  used?: number;
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
    .neq("feature", "ask")
    .returns<Array<{ credits_used: number }>>();
  if (error) throw new AiCreditLedgerError("usage_read_failed", error, AI_USAGE_EVENTS_TABLE, "select");
  return (data || []).reduce((total, event) => total + Math.max(0, event.credits_used || 0), 0);
}

export async function getRemainingAiCredits({
  feature,
  monthlyAiCredits,
  planId = "free",
  supabase,
  userId,
}: {
  feature?: AiFeature;
  monthlyAiCredits?: number;
  planId?: PlanId;
  supabase: SupabaseClient;
  userId: string;
}): Promise<AiCreditStatus> {
  if (feature === "ask") return getAskAllowanceStatus({ supabase });
  const limit = getMonthlyAiAllowance(userId, planId, monthlyAiCredits);
  const count = await getMonthlyAiUsage({ supabase, userId });
  const remaining = Math.max(0, limit - count);
  return { allowed: remaining > 0, count, ledgerMode: "database", limit, monthKey: getAiMonthKey(), planId, remaining };
}

export async function getAskAllowanceStatus({ supabase }: { supabase: SupabaseClient }): Promise<AiCreditStatus> {
  const { data, error } = await supabase.rpc("get_my_ask_allowance_status");
  if (error) throw new AiCreditLedgerError("usage_read_failed", error, "get_my_ask_allowance_status", "rpc");
  const row = (Array.isArray(data) ? data[0] : data) as AskAllowanceRpcRow | null;
  const planId = row?.effective_plan === "plus" ? "plus" : row?.effective_plan === "free" ? "free" : null;
  const limit = positiveInteger(row?.allowance) ? row.allowance : null;
  const count = nonNegativeInteger(row?.used) ? row.used : null;
  const remaining = nonNegativeInteger(row?.remaining) ? row.remaining : null;
  if (!planId || limit === null || count === null || remaining === null || typeof row?.period_start !== "string" || typeof row.period_end !== "string") {
    throw new AiCreditLedgerError("usage_read_failed", new Error("INVALID_ASK_ALLOWANCE_RESPONSE"), "get_my_ask_allowance_status", "rpc");
  }
  return {
    allowed: remaining > 0,
    billingPlan: row.billing_plan === "plus" ? "plus" : "free",
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    count,
    ledgerMode: "database",
    limit,
    monthKey: row.period_start,
    planId,
    remaining,
    resetAt: row.period_end,
    subscriptionStatus: typeof row.subscription_status === "string" ? row.subscription_status : "none",
  };
}

export async function reserveAiCredit({
  feature,
  ledgerClient,
  payloadHash,
  requestId,
  logicalRequestId = requestId,
  userId,
}: {
  feature: AiFeature;
  ledgerClient?: SupabaseClient;
  logicalRequestId?: string;
  payloadHash: string;
  requestId: string;
  userId: string;
}): Promise<AiCreditReservation> {
  const supabase = ledgerClient || await createTrustedLedgerClient();
  const { data, error } = await supabase.rpc("reserve_ai_credit", {
    p_feature: feature,
    p_logical_request_id: logicalRequestId,
    p_payload_hash: payloadHash,
    p_request_id: requestId,
    p_user_id: userId,
  });
  if (error) throw new AiCreditLedgerError("reservation_failed", error, "reserve_ai_credit", "rpc");
  const result = parseLedgerResult(data, "reservation_status");
  recordActiveAiUserCreditState(result.status === "completed" ? "reused" : result.status);
  return result;
}

export async function completeAiCredit({
  feature,
  ledgerClient,
  payloadHash,
  requestId,
  logicalRequestId = requestId,
  userId,
}: {
  feature: AiFeature;
  ledgerClient?: SupabaseClient;
  logicalRequestId?: string;
  payloadHash: string;
  requestId: string;
  userId: string;
}) {
  const supabase = ledgerClient || await createTrustedLedgerClient();
  await setAiCreditDisposition({
    disposition: "complete",
    feature,
    ledgerClient: supabase,
    logicalRequestId,
    payloadHash,
    requestId,
    userId,
  });
  const { data, error } = await supabase.rpc("complete_ai_credit", {
    p_feature: feature,
    p_logical_request_id: logicalRequestId,
    p_payload_hash: payloadHash,
    p_request_id: requestId,
    p_user_id: userId,
  });
  if (error) throw new AiCreditLedgerError("completion_failed", error, "complete_ai_credit", "rpc");
  const result = parseLedgerResult(data, "event_status");
  if (result.status !== "completed") throw new AiCreditLedgerError("completion_failed", new Error("AI_CREDIT_COMPLETION_NOT_COMMITTED"), "complete_ai_credit", "rpc");
  recordActiveAiUserCreditState("completed");
  return result;
}

export async function releaseAiCredit({
  feature,
  ledgerClient,
  payloadHash,
  requestId,
  logicalRequestId = requestId,
  userId,
}: {
  feature: AiFeature;
  ledgerClient?: SupabaseClient;
  logicalRequestId?: string;
  payloadHash: string;
  requestId: string;
  userId: string;
}) {
  const supabase = ledgerClient || await createTrustedLedgerClient();
  await setAiCreditDisposition({
    disposition: "release",
    feature,
    ledgerClient: supabase,
    logicalRequestId,
    payloadHash,
    requestId,
    userId,
  });
  const { data, error } = await supabase.rpc("release_ai_credit", {
    p_feature: feature,
    p_logical_request_id: logicalRequestId,
    p_payload_hash: payloadHash,
    p_request_id: requestId,
    p_user_id: userId,
  });
  if (error) throw new AiCreditLedgerError("release_failed", error, "release_ai_credit", "rpc");
  const result = parseLedgerResult(data, "event_status");
  if (result.status !== "released") throw new AiCreditLedgerError("release_failed", new Error("AI_CREDIT_RELEASE_NOT_COMMITTED"), "release_ai_credit", "rpc");
  recordActiveAiUserCreditState("released");
  return result;
}

export async function setAiCreditDisposition({
  disposition,
  feature,
  ledgerClient,
  logicalRequestId,
  payloadHash,
  requestId,
  userId,
}: {
  disposition: AiCreditDisposition;
  feature: AiFeature;
  ledgerClient?: SupabaseClient;
  logicalRequestId: string;
  payloadHash: string;
  requestId: string;
  userId: string;
}) {
  const supabase = ledgerClient || await createTrustedLedgerClient();
  const { data, error } = await supabase.rpc("set_ai_credit_disposition", {
    p_disposition: disposition,
    p_feature: feature,
    p_logical_request_id: logicalRequestId,
    p_payload_hash: payloadHash,
    p_request_id: requestId,
    p_user_id: userId,
  });
  if (error) throw new AiCreditLedgerError("disposition_failed", error, "set_ai_credit_disposition", "rpc");
  const row = (Array.isArray(data) ? data[0] : data) as LedgerRpcRow | null;
  if (row?.settlement_disposition !== disposition) {
    throw new AiCreditLedgerError("disposition_failed", new Error("AI_CREDIT_DISPOSITION_NOT_DURABLE"), "set_ai_credit_disposition", "rpc");
  }
  return { disposition, status: parseEventStatus(row?.event_status) };
}

export async function reconcileAiCredit({
  feature,
  ledgerClient,
  logicalRequestId,
  payloadHash,
  requestId,
  userId,
}: {
  feature: AiFeature;
  ledgerClient?: SupabaseClient;
  logicalRequestId: string;
  payloadHash: string;
  requestId: string;
  userId: string;
}) {
  const supabase = ledgerClient || await createTrustedLedgerClient();
  const { data, error } = await supabase.rpc("reconcile_ai_credit", {
    p_feature: feature,
    p_logical_request_id: logicalRequestId,
    p_payload_hash: payloadHash,
    p_request_id: requestId,
    p_user_id: userId,
  });
  if (error) throw new AiCreditLedgerError("reconciliation_failed", error, "reconcile_ai_credit", "rpc");
  const row = (Array.isArray(data) ? data[0] : data) as LedgerRpcRow | null;
  const disposition = parseDisposition(row?.settlement_disposition);
  const status = parseEventStatus(row?.event_status);
  if ((disposition === "complete" && status !== "completed") || (disposition === "release" && status !== "released")) {
    throw new AiCreditLedgerError("reconciliation_failed", new Error("AI_CREDIT_RECONCILIATION_NOT_TERMINAL"), "reconcile_ai_credit", "rpc");
  }
  recordActiveAiUserCreditState(status);
  return {
    creditsUsed: typeof row?.credits_used === "number" ? row.credits_used : status === "completed" ? 1 : 0,
    disposition,
    remaining: typeof row?.remaining === "number" ? Math.max(0, row.remaining) : 0,
    status,
  };
}

export async function getAiCreditEventState({
  feature,
  payloadHash,
  requestId,
  logicalRequestId = requestId,
  supabase,
  userId,
}: {
  feature: AiFeature;
  logicalRequestId?: string;
  payloadHash: string;
  requestId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<AiCreditEventState | null> {
  const { data, error } = await supabase
    .from(AI_USAGE_EVENTS_TABLE)
    .select("request_id, logical_request_id, status, settlement_disposition, payload_hash")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("request_id", requestId)
    .maybeSingle<{ logical_request_id: string; payload_hash: string | null; request_id: string; settlement_disposition: string | null; status: string }>();
  if (error) throw new AiCreditLedgerError("usage_read_failed", error, AI_USAGE_EVENTS_TABLE, "select");
  if (!data) return null;
  if (data.payload_hash && data.payload_hash !== payloadHash) {
    throw new AiCreditLedgerError("usage_read_failed", new Error("AI_REQUEST_IDENTITY_CONFLICT"), AI_USAGE_EVENTS_TABLE, "select");
  }
  if (data.logical_request_id !== logicalRequestId) {
    throw new AiCreditLedgerError("usage_read_failed", new Error("AI_REQUEST_IDENTITY_CONFLICT"), AI_USAGE_EVENTS_TABLE, "select");
  }
  if (data.status !== "reserved" && data.status !== "completed" && data.status !== "released") {
    throw new AiCreditLedgerError("usage_read_failed", new Error("INVALID_AI_CREDIT_STATUS"), AI_USAGE_EVENTS_TABLE, "select");
  }
  return {
    disposition: nullableDisposition(data.settlement_disposition),
    logicalRequestId: data.logical_request_id,
    payloadHash: data.payload_hash,
    requestId: data.request_id,
    status: data.status,
  };
}

export async function getAiCreditEventsForLogicalRequest({
  feature,
  logicalRequestId,
  payloadHash,
  supabase,
  userId,
}: {
  feature: AiFeature;
  logicalRequestId: string;
  payloadHash: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<AiCreditEventState[]> {
  const { data, error } = await supabase
    .from(AI_USAGE_EVENTS_TABLE)
    .select("request_id, logical_request_id, status, settlement_disposition, payload_hash")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("logical_request_id", logicalRequestId)
    .order("created_at", { ascending: true })
    .returns<Array<{ logical_request_id: string; payload_hash: string | null; request_id: string; settlement_disposition: string | null; status: string }>>();
  if (error) throw new AiCreditLedgerError("usage_read_failed", error, AI_USAGE_EVENTS_TABLE, "select");
  return (data || []).map((row) => {
    if (row.logical_request_id !== logicalRequestId || row.payload_hash !== payloadHash) {
      throw new AiCreditLedgerError("usage_read_failed", new Error("AI_REQUEST_IDENTITY_CONFLICT"), AI_USAGE_EVENTS_TABLE, "select");
    }
    if (row.status !== "reserved" && row.status !== "completed" && row.status !== "released") {
      throw new AiCreditLedgerError("usage_read_failed", new Error("INVALID_AI_CREDIT_STATUS"), AI_USAGE_EVENTS_TABLE, "select");
    }
    return {
      disposition: nullableDisposition(row.settlement_disposition),
      logicalRequestId: row.logical_request_id,
      payloadHash: row.payload_hash,
      requestId: row.request_id,
      status: row.status,
    };
  });
}

export async function reconcileAiCreditLogicalRequest({
  feature,
  ledgerClient,
  logicalRequestId,
  payloadHash,
  supabase,
  userId,
}: {
  feature: AiFeature;
  ledgerClient?: SupabaseClient;
  logicalRequestId: string;
  payloadHash: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const states = await getAiCreditEventsForLogicalRequest({ feature, logicalRequestId, payloadHash, supabase, userId });
  if (states.some((state) => state.disposition === null)) {
    throw new AiCreditLedgerError("reconciliation_failed", new Error("AI_CREDIT_DISPOSITION_REQUIRED"), AI_USAGE_EVENTS_TABLE, "select");
  }
  const completeCount = states.filter((state) => state.disposition === "complete").length;
  if (completeCount > 1) {
    throw new AiCreditLedgerError("reconciliation_failed", new Error("AI_CREDIT_DISPOSITION_CONFLICT"), AI_USAGE_EVENTS_TABLE, "select");
  }
  for (const state of states) {
    if (state.status !== "reserved") continue;
    await reconcileAiCredit({
      feature,
      ledgerClient,
      logicalRequestId,
      payloadHash,
      requestId: state.requestId,
      userId,
    });
  }
  return { chargeable: completeCount === 1, eventCount: states.length };
}

export class AiCreditLedgerError extends Error {
  stage: "usage_read_failed" | "reservation_failed" | "disposition_failed" | "completion_failed" | "release_failed" | "reconciliation_failed";
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

export function isAiCreditIntegrityError(error: unknown) {
  const diagnostic = getAiCreditLedgerDiagnostic(error);
  const detail = `${diagnostic.code} ${diagnostic.message} ${diagnostic.details} ${diagnostic.hint}`;
  return diagnostic.code === "23505" || diagnostic.code === "23514"
    || /AI_(?:REQUEST_IDENTITY_CONFLICT|CREDIT_DISPOSITION|CREDIT_TERMINAL|CREDIT_IDENTITY_IMMUTABLE)/.test(detail);
}

export function isMissingAiUsageTableError(error: unknown) {
  const diagnostic = getAiCreditLedgerDiagnostic(error);
  if (diagnostic.resource === "get_my_ask_allowance_status" && diagnostic.operation === "rpc") {
    const rpcText = `${diagnostic.message} ${diagnostic.details} ${diagnostic.hint}`.toLowerCase();
    return ["42883", "PGRST202"].includes(diagnostic.code) && rpcText.includes("get_my_ask_allowance_status");
  }
  if (diagnostic.resource !== AI_USAGE_EVENTS_TABLE || diagnostic.operation !== "select") return false;
  const text = `${diagnostic.message} ${diagnostic.details} ${diagnostic.hint}`.toLowerCase();
  return (diagnostic.code === "42P01" || diagnostic.code === "PGRST205") &&
    (text.includes("ai_usage_events") || text.includes("schema cache") || text.includes("relation"));
}

export function buildDevelopmentAiCreditFallback(planId: PlanId): AiCreditStatus {
  const limit = getAskAllowance(planId);
  const now = new Date();
  const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return {
    allowed: true,
    count: 0,
    ledgerMode: "development_missing_migration",
    limit,
    monthKey: getAiMonthKey(),
    planId,
    remaining: limit,
    resetAt,
  };
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export class AiCreditLimitReachedError extends Error {
  constructor() {
    super("AI_CREDIT_LIMIT_REACHED");
    this.name = "AiCreditLimitReachedError";
  }
}

export class AiCreditReplayRequiredError extends Error {
  constructor(status: "completed" | "released") {
    super(status === "completed" ? "AI_CREDIT_COMPLETED_REPLAY_REQUIRED" : "AI_CREDIT_RELEASED_NEW_REQUEST_REQUIRED");
    this.name = "AiCreditReplayRequiredError";
  }
}

export function hashAiCreditPayload(feature: AiFeature, payload: unknown) {
  return createHash("sha256").update(canonicalAiCreditJson({ feature, payload, version: 1 })).digest("hex");
}

export async function runWithAiCredit<T>({
  beforeComplete,
  feature,
  generate,
  monthlyAiCredits,
  ledgerClient,
  payload,
  planId = "free",
  requestId,
  supabase,
  userId,
}: {
  beforeComplete?: (value: T) => Promise<void>;
  feature: AiFeature;
  generate: () => Promise<T>;
  monthlyAiCredits?: number;
  ledgerClient?: SupabaseClient;
  payload: unknown;
  planId?: PlanId;
  requestId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const payloadHash = hashAiCreditPayload(feature, payload);
  const reservation = await reserveAiCredit({ feature, ledgerClient, payloadHash, requestId, userId });
  if (reservation.status === "limit_reached") throw new AiCreditLimitReachedError();
  if (reservation.status === "completed" || reservation.status === "released") {
    throw new AiCreditReplayRequiredError(reservation.status);
  }
  let completionAttempted = false;
  try {
    const value = await generate();
    if (beforeComplete) await beforeComplete(value);
    completionAttempted = true;
    try {
      await completeAiCredit({ feature, ledgerClient, payloadHash, requestId, userId });
    } catch {
      await completeAiCredit({ feature, ledgerClient, payloadHash, requestId, userId });
    }
    const usage = await getRemainingAiCredits({ feature, monthlyAiCredits, planId, supabase, userId });
    return { creditsUsed: 1, usage, value };
  } catch (error) {
    if (!completionAttempted) {
      const logicalRequestId = requestId;
      await setAiCreditDisposition({ disposition: "release", feature, ledgerClient, logicalRequestId, payloadHash, requestId, userId });
      try {
        await reconcileAiCredit({ feature, ledgerClient, logicalRequestId, payloadHash, requestId, userId });
      } catch (settlementError) {
        if (isAiCreditIntegrityError(settlementError)) throw settlementError;
        // Durable release intent makes only compatible terminal execution retryable.
      }
    }
    throw error;
  }
}

function parseEventStatus(value: unknown): "reserved" | "completed" | "released" {
  if (value !== "reserved" && value !== "completed" && value !== "released") {
    throw new AiCreditLedgerError("reconciliation_failed", new Error("INVALID_AI_CREDIT_STATUS"), "ai_usage_events", "rpc");
  }
  return value;
}

function parseDisposition(value: unknown): AiCreditDisposition {
  if (value !== "complete" && value !== "release") {
    throw new AiCreditLedgerError("reconciliation_failed", new Error("AI_CREDIT_DISPOSITION_REQUIRED"), "ai_usage_events", "rpc");
  }
  return value;
}

function nullableDisposition(value: unknown): AiCreditDisposition | null {
  if (value === null) return null;
  return parseDisposition(value);
}

function parseLedgerResult(data: unknown, statusKey: "reservation_status" | "event_status"): AiCreditReservation {
  const row = (Array.isArray(data) ? data[0] : data) as LedgerRpcRow | null;
  const rawStatus = row?.[statusKey];
  if (rawStatus !== "reserved" && rawStatus !== "completed" && rawStatus !== "released" && rawStatus !== "limit_reached") {
    throw new AiCreditLedgerError("reservation_failed", new Error("INVALID_AI_CREDIT_RPC_RESPONSE"), statusKey, "rpc");
  }
  const status = rawStatus;
  return {
    creditsUsed: typeof row?.credits_used === "number" ? row.credits_used : status === "released" || status === "limit_reached" ? 0 : 1,
    remaining: typeof row?.remaining === "number" ? Math.max(0, row.remaining) : 0,
    status,
  };
}

async function createTrustedLedgerClient() {
  const { createAiCreditAdminClient } = await import("./usage-ledger-admin.ts");
  return createAiCreditAdminClient();
}

function canonicalAiCreditJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalAiCreditJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => !["idempotencyKey", "idempotency_key", "requestId"].includes(key)).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalAiCreditJson(record[key])}`).join(",")}}`;
}
