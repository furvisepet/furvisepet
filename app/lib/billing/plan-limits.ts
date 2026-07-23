export type PlanId = "free" | "plus";

export type PlanLimits = {
  askFurviseMonthlyLimit: number;
  careLog: "unlimited";
  curatedProducts: boolean;
  dashboard: boolean;
  liveProductResearch: boolean;
  longHistoryPatternDetection: boolean;
  maxPets: number;
  productQuestionMonthlyLimit: number;
  productsAiMonthlyLimit: number;
  shopSearchMonthlyLimit: number;
  vetPrepExports: boolean;
};

export type PlanCapabilities = PlanLimits & {
  id: PlanId;
  label: string;
};

export const FREE_PLAN_ID: PlanId = "free";
export const PLUS_PLAN_ID: PlanId = "plus";

export const PLAN_CAPABILITIES: Record<PlanId, PlanCapabilities> = {
  free: {
    id: "free",
    label: "Free plan",
    askFurviseMonthlyLimit: 20,
    careLog: "unlimited",
    curatedProducts: true,
    dashboard: true,
    liveProductResearch: false,
    longHistoryPatternDetection: false,
    maxPets: 1,
    productQuestionMonthlyLimit: 80,
    productsAiMonthlyLimit: 80,
    shopSearchMonthlyLimit: 80,
    vetPrepExports: false,
  },
  plus: {
    id: "plus",
    label: "Furvise Plus",
    askFurviseMonthlyLimit: 200,
    careLog: "unlimited",
    curatedProducts: true,
    dashboard: true,
    liveProductResearch: true,
    longHistoryPatternDetection: true,
    maxPets: 10,
    productQuestionMonthlyLimit: 80,
    productsAiMonthlyLimit: 80,
    shopSearchMonthlyLimit: 80,
    vetPrepExports: true,
  },
};

export type GateDecision = {
  allowed: boolean;
  hardBlocked: boolean;
  message: string | null;
  softNotice: string | null;
};

export function normalizePlanId(value: unknown): PlanId {
  return value === PLUS_PLAN_ID ? PLUS_PLAN_ID : FREE_PLAN_ID;
}

export function getPlanCapabilities(planId: unknown): PlanCapabilities {
  return PLAN_CAPABILITIES[normalizePlanId(planId)];
}

export async function getUserPlan(
  _userId: string,
  lookup?: () => Promise<unknown> | unknown,
): Promise<PlanId> {
  if (!lookup) return FREE_PLAN_ID;

  try {
    return normalizePlanId(await lookup());
  } catch {
    return FREE_PLAN_ID;
  }
}

export function isEarlyAccessFreeUnlockEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NEXT_PUBLIC_EARLY_ACCESS_FREE_UNLOCKS === "true" || env.EARLY_ACCESS_FREE_UNLOCKS === "true";
}

export function evaluatePetLimit({
  earlyAccessUnlocked = isEarlyAccessFreeUnlockEnabled(),
  isEditingExistingPet,
  petCount,
  planId,
}: {
  earlyAccessUnlocked?: boolean;
  isEditingExistingPet: boolean;
  petCount: number;
  planId: PlanId;
}): GateDecision {
  const plan = getPlanCapabilities(planId);
  if (isEditingExistingPet || petCount < plan.maxPets) {
    return { allowed: true, hardBlocked: false, message: null, softNotice: null };
  }

  const petLabel = plan.maxPets === 1 ? "pet" : "pets";
  const planLabel = plan.id === FREE_PLAN_ID ? "Your free plan" : "Your plan";
  const message = `${planLabel} includes ${plan.maxPets} ${petLabel}. Upgrade will unlock additional pets.`;
  if (earlyAccessUnlocked) {
    return {
      allowed: true,
      hardBlocked: false,
      message: null,
      softNotice: `${message} Early access: extra pets are currently unlocked.`,
    };
  }

  return { allowed: false, hardBlocked: true, message, softNotice: null };
}

export function evaluateAskUsageLimit({
  earlyAccessUnlocked = isEarlyAccessFreeUnlockEnabled(),
  monthlyCount,
  planId,
}: {
  earlyAccessUnlocked?: boolean;
  monthlyCount: number;
  planId: PlanId;
}): GateDecision & { limit: number; remaining: number } {
  const plan = getPlanCapabilities(planId);
  const remaining = Math.max(0, plan.askFurviseMonthlyLimit - monthlyCount);
  if (monthlyCount < plan.askFurviseMonthlyLimit) {
    return { allowed: true, hardBlocked: false, limit: plan.askFurviseMonthlyLimit, message: null, remaining, softNotice: null };
  }

  const message = "You've used your free Ask Furvise messages for this month.";
  if (earlyAccessUnlocked) {
    return {
      allowed: true,
      hardBlocked: false,
      limit: plan.askFurviseMonthlyLimit,
      message: null,
      remaining: 0,
      softNotice: "Early access: extra Ask Furvise messages are currently unlocked.",
    };
  }

  return { allowed: false, hardBlocked: true, limit: plan.askFurviseMonthlyLimit, message, remaining: 0, softNotice: null };
}

export function evaluateShopSearchUsageLimit({
  earlyAccessUnlocked = isEarlyAccessFreeUnlockEnabled(),
  monthlyCount,
  planId,
}: {
  earlyAccessUnlocked?: boolean;
  monthlyCount: number;
  planId: PlanId;
}): GateDecision & { limit: number; remaining: number } {
  const plan = getPlanCapabilities(planId);
  const remaining = Math.max(0, plan.productsAiMonthlyLimit - monthlyCount);
  if (monthlyCount < plan.productsAiMonthlyLimit) {
    return { allowed: true, hardBlocked: false, limit: plan.productsAiMonthlyLimit, message: null, remaining, softNotice: null };
  }

  const message = "You've used your included Product AI for this month.";
  if (earlyAccessUnlocked) {
    return {
      allowed: true,
      hardBlocked: false,
      limit: plan.productsAiMonthlyLimit,
      message: null,
      remaining: 0,
      softNotice: "Early access: extra Product AI uses are currently unlocked.",
    };
  }

  return { allowed: false, hardBlocked: true, limit: plan.productsAiMonthlyLimit, message, remaining: 0, softNotice: null };
}

export const evaluateProductsAiUsageLimit = evaluateShopSearchUsageLimit;

export function getPaidGateMessage(capability: "liveProductResearch" | "longHistoryPatternDetection" | "vetPrepExports") {
  if (capability === "longHistoryPatternDetection") {
    return "Longer-history pattern detection is planned for Furvise Plus.";
  }
  if (capability === "vetPrepExports") {
    return "Exportable vet-prep reports are planned for Furvise Plus.";
  }
  return "Live product research is planned for Furvise Plus once it is built.";
}
