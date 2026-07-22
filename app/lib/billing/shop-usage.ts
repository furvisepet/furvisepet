import type { GateDecision, PlanId } from "./plan-limits";

export type ShopSearchUsageRow = {
  count: number;
  created_at?: string;
  id?: string;
  month_key: string;
  updated_at?: string;
  user_id: string;
};

export type ShopSearchUsageStatus = {
  allowed: boolean;
  count: number;
  earlyAccessUnlocked: boolean;
  gate: GateDecision & { limit: number; remaining: number };
  limit: number;
  monthKey: string;
  planId: PlanId;
  remaining: number;
};

const SHOP_SEARCH_USAGE_TABLE = "shop_search_usage";

type SupabaseErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

export class ShopSearchUsageReadError extends Error {
  cause: unknown;

  constructor(cause: unknown) {
    super("Furvise could not load Shop search usage.");
    this.name = "ShopSearchUsageReadError";
    this.cause = cause;
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

export function getShopSearchUsageMonthKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function getShopSearchUsageStatus({
  earlyAccessUnlocked = false,
  monthlyLimit,
  monthKey = getShopSearchUsageMonthKey(),
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
}): Promise<ShopSearchUsageStatus> {
  let count = 0;
  try {
    count = await readShopSearchUsageCount({ monthKey, supabase, userId });
  } catch (error) {
    if (!earlyAccessUnlocked || !(error instanceof ShopSearchUsageReadError)) throw error;
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
      softNotice: "Early access: extra Shop searches are currently unlocked.",
    };
  }
  return {
    allowed: false,
    hardBlocked: true,
    limit: monthlyLimit,
    message: "You've used your included Shop searches for this month.",
    remaining: 0,
    softNotice: null,
  };
}

export async function readShopSearchUsageCount({
  monthKey,
  supabase,
  userId,
}: {
  monthKey: string;
  supabase: SupabaseLike;
  userId: string;
}) {
  const query = supabase
    .from(SHOP_SEARCH_USAGE_TABLE)
    .select("count")
    .eq("user_id", userId)
    .eq("month_key", monthKey);
  const result = await query.maybeSingle?.<Pick<ShopSearchUsageRow, "count">>() as
    | { data: Pick<ShopSearchUsageRow, "count"> | null; error: unknown | null }
    | undefined;
  if (!result) return 0;
  if (result.error) {
    logShopSearchUsageError("readShopSearchUsageCount", result.error);
    throw new ShopSearchUsageReadError(result.error);
  }
  return typeof result.data?.count === "number" ? result.data.count : 0;
}

export async function incrementShopSearchUsage({
  monthKey,
  previousCount,
  supabase,
  userId,
}: {
  monthKey: string;
  previousCount: number;
  supabase: SupabaseLike;
  userId: string;
}): Promise<ShopSearchUsageRow> {
  const nextCount = previousCount + 1;
  const query = supabase
    .from(SHOP_SEARCH_USAGE_TABLE)
    .upsert?.(
      {
        count: nextCount,
        month_key: monthKey,
        updated_at: new Date().toISOString(),
        user_id: userId,
      },
      { onConflict: "user_id,month_key" },
    )
    .select?.()
    .single?.<ShopSearchUsageRow>();
  const result = await query;
  if (!result) throw new Error("Furvise could not update Shop search usage.");
  if (result.error) {
    logShopSearchUsageError("incrementShopSearchUsage", result.error);
    throw new Error("Furvise could not update Shop search usage.");
  }
  return {
    count: nextCount,
    month_key: monthKey,
    user_id: userId,
  };
}

export function formatShopSearchUsageStatus(usage: ShopSearchUsageStatus): ShopSearchUsageStatus {
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

export function logShopSearchUsageError(action: "readShopSearchUsageCount" | "incrementShopSearchUsage", error: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  const supabaseError = normalizeSupabaseError(error);
  console.error("[Shop search usage]", {
    action,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
    message: supabaseError.message,
    table: SHOP_SEARCH_USAGE_TABLE,
  });
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
