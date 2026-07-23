import type { GateDecision, PlanId } from "./plan-limits";

export type ProductAiUsageRow = {
  count?: number;
  created_at?: string;
  id?: string;
  month_key: string;
  updated_at?: string;
  used_count: number;
  user_id: string;
};

export type ProductAiUsageIncrementRow = ProductAiUsageRow & {
  count: number;
};

export type ProductAiUsageStatus = {
  allowed: boolean;
  count: number;
  earlyAccessUnlocked: boolean;
  gate: GateDecision & { limit: number; remaining: number };
  limit: number;
  monthKey: string;
  planId: PlanId;
  remaining: number;
};

export type ShopSearchUsageRow = ProductAiUsageRow;
export type ShopSearchUsageStatus = ProductAiUsageStatus;

export const PRODUCT_AI_USAGE_TABLE = "product_ai_usage";

type SupabaseErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

export class ProductAiUsageReadError extends Error {
  cause: unknown;

  constructor(cause: unknown) {
    super("Furvise could not load Product AI usage.");
    this.name = "ProductAiUsageReadError";
    this.cause = cause;
  }
}

export class ShopSearchUsageReadError extends ProductAiUsageReadError {
  constructor(cause: unknown) {
    super(cause);
    this.name = "ShopSearchUsageReadError";
  }
}

export type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => QueryLike;
    upsert?: (payload: unknown, options?: unknown) => QueryLike;
  };
};

type QueryLike = {
  eq: (field: string, value: unknown) => QueryLike;
  maybeSingle?: <T>() => PromiseLike<{ data: T | null; error: unknown | null }> | { data: unknown | null; error: unknown | null };
  select?: (columns?: string) => QueryLike;
  single?: <T>() => PromiseLike<{ data: T | null; error: unknown | null }> | { data: unknown | null; error: unknown | null };
};

export function getProductAiUsageMonthKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export const getShopSearchUsageMonthKey = getProductAiUsageMonthKey;

export function buildProductAiUsageUnavailableStatus({
  earlyAccessUnlocked = false,
  monthlyLimit,
  monthKey = getProductAiUsageMonthKey(),
  planId = "free",
}: {
  earlyAccessUnlocked?: boolean;
  monthlyLimit: number;
  monthKey?: string;
  planId?: PlanId;
}): ProductAiUsageStatus {
  const gate = evaluateUsageCount({ count: 0, earlyAccessUnlocked, monthlyLimit });
  return {
    allowed: true,
    count: 0,
    earlyAccessUnlocked,
    gate: {
      ...gate,
      allowed: true,
      hardBlocked: false,
    },
    limit: monthlyLimit,
    monthKey,
    planId,
    remaining: monthlyLimit,
  };
}

export async function getProductAiUsageStatus({
  earlyAccessUnlocked = false,
  monthlyLimit,
  monthKey = getProductAiUsageMonthKey(),
  planId = "free",
  supabase,
  userId,
}: {
  earlyAccessUnlocked?: boolean;
  monthlyLimit: number;
  monthKey?: string;
  planId?: PlanId;
  supabase: SupabaseLike;
  userId: string;
}): Promise<ProductAiUsageStatus> {
  let count = 0;
  try {
    count = await readProductAiUsageCount({ monthKey, supabase, userId });
  } catch (error) {
    if (!earlyAccessUnlocked || !(error instanceof ProductAiUsageReadError)) throw error;
  }
  const gate = evaluateUsageCount({ count, earlyAccessUnlocked, monthlyLimit });
  return {
    allowed: gate.allowed,
    count,
    earlyAccessUnlocked,
    gate,
    limit: monthlyLimit,
    monthKey,
    planId,
    remaining: gate.remaining,
  };
}

export const getShopSearchUsageStatus = getProductAiUsageStatus;

function evaluateUsageCount({
  count,
  earlyAccessUnlocked,
  monthlyLimit,
}: {
  count: number;
  earlyAccessUnlocked: boolean;
  monthlyLimit: number;
}): GateDecision & { limit: number; remaining: number } {
  const remaining = Math.max(0, monthlyLimit - count);
  if (count < monthlyLimit) {
    return { allowed: true, hardBlocked: false, limit: monthlyLimit, message: null, remaining, softNotice: null };
  }
  if (earlyAccessUnlocked) {
    return {
      allowed: true,
      hardBlocked: false,
      limit: monthlyLimit,
      message: null,
      remaining: 0,
      softNotice: "Early access: extra Product AI uses are currently unlocked.",
    };
  }
  return {
    allowed: false,
    hardBlocked: true,
    limit: monthlyLimit,
    message: "You've used your included Product AI for this month.",
    remaining: 0,
    softNotice: null,
  };
}

export async function readProductAiUsageCount({
  monthKey,
  supabase,
  userId,
}: {
  monthKey: string;
  supabase: SupabaseLike;
  userId: string;
}) {
  const query = supabase
    .from(PRODUCT_AI_USAGE_TABLE)
    .select("used_count")
    .eq("user_id", userId)
    .eq("month_key", monthKey);
  const result = await query.maybeSingle?.<Pick<ProductAiUsageRow, "used_count">>() as
    | { data: Pick<ProductAiUsageRow, "used_count"> | null; error: unknown | null }
    | undefined;
  if (!result) return 0;
  if (result.error) {
    logProductAiUsageError("readProductAiUsageCount", result.error);
    throw new ProductAiUsageReadError(result.error);
  }
  return typeof result.data?.used_count === "number" ? result.data.used_count : 0;
}

export const readShopSearchUsageCount = readProductAiUsageCount;

export async function incrementProductAiUsage({
  monthKey,
  previousCount,
  supabase,
  userId,
}: {
  monthKey: string;
  previousCount: number;
  supabase: SupabaseLike;
  userId: string;
}): Promise<ProductAiUsageIncrementRow> {
  const nextCount = previousCount + 1;
  const query = supabase
    .from(PRODUCT_AI_USAGE_TABLE)
    .upsert?.(
      {
        month_key: monthKey,
        updated_at: new Date().toISOString(),
        used_count: nextCount,
        user_id: userId,
      },
      { onConflict: "user_id,month_key" },
    )
    .select?.()
    .single?.<ProductAiUsageRow>();
  const result = await query;
  if (!result) throw new Error("Furvise could not update Product AI usage.");
  if (result.error) {
    logProductAiUsageError("incrementProductAiUsage", result.error);
    throw new Error("Furvise could not update Product AI usage.");
  }
  return {
    count: nextCount,
    month_key: monthKey,
    used_count: nextCount,
    user_id: userId,
  };
}

export const incrementShopSearchUsage = incrementProductAiUsage;

export function formatProductAiUsageStatus(usage: ProductAiUsageStatus): ProductAiUsageStatus {
  const remaining = Math.max(0, usage.limit - usage.count);
  return {
    ...usage,
    allowed: usage.earlyAccessUnlocked || usage.count < usage.limit,
    gate: {
      ...usage.gate,
      allowed: usage.earlyAccessUnlocked || usage.count < usage.limit,
      hardBlocked: !usage.earlyAccessUnlocked && usage.count >= usage.limit,
      remaining,
    },
    remaining,
  };
}

export const formatShopSearchUsageStatus = formatProductAiUsageStatus;

export function logProductAiUsageError(action: "readProductAiUsageCount" | "incrementProductAiUsage", error: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  const supabaseError = normalizeSupabaseError(error);
  console.error("[Product AI usage]", {
    action,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
    message: supabaseError.message,
    table: PRODUCT_AI_USAGE_TABLE,
  });
}

export function logShopSearchUsageError(action: "readShopSearchUsageCount" | "incrementShopSearchUsage", error: unknown) {
  logProductAiUsageError(
    action === "readShopSearchUsageCount" ? "readProductAiUsageCount" : "incrementProductAiUsage",
    error,
  );
}

function normalizeSupabaseError(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== "object") return { message: String(error) };
  const value = error as SupabaseErrorLike;
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}
