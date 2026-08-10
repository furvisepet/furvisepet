import type { PlanId } from "./plan-limits";

export type AccountAccessRole = "consumer" | "internal_qa";

export type EffectiveEntitlements = {
  accessRole: AccountAccessRole;
  billingPlan: PlanId;
  effectivePlan: PlanId;
  capabilities: {
    liveProductResearch: boolean;
    longHistoryPatternDetection: boolean;
    productsPaidFunctionality: boolean;
    vetPrepExports: boolean;
  };
  limits: {
    maxPets: number;
    monthlyAiCredits: number;
  };
};

type EntitlementRow = {
  access_role?: unknown;
  billing_plan?: unknown;
  effective_plan?: unknown;
  live_product_research?: unknown;
  long_history_pattern_detection?: unknown;
  products_paid_functionality?: unknown;
  vet_prep_exports?: unknown;
  max_pets?: unknown;
  monthly_ai_credits?: unknown;
};

export function parseEffectiveEntitlements(value: unknown): EffectiveEntitlements | null {
  if (!value || typeof value !== "object") return null;
  const row = value as EntitlementRow;
  const accessRole = row.access_role === "internal_qa" ? "internal_qa" : row.access_role === "consumer" ? "consumer" : null;
  const billingPlan = parsePlan(row.billing_plan);
  const effectivePlan = parsePlan(row.effective_plan);
  if (!accessRole || !billingPlan || !effectivePlan) return null;
  if (![row.live_product_research, row.long_history_pattern_detection, row.products_paid_functionality, row.vet_prep_exports].every((item) => typeof item === "boolean")) return null;
  if (!positiveInteger(row.max_pets) || !positiveInteger(row.monthly_ai_credits)) return null;
  return {
    accessRole,
    billingPlan,
    effectivePlan,
    capabilities: {
      liveProductResearch: row.live_product_research as boolean,
      longHistoryPatternDetection: row.long_history_pattern_detection as boolean,
      productsPaidFunctionality: row.products_paid_functionality as boolean,
      vetPrepExports: row.vet_prep_exports as boolean,
    },
    limits: {
      maxPets: row.max_pets as number,
      monthlyAiCredits: row.monthly_ai_credits as number,
    },
  };
}

function parsePlan(value: unknown): PlanId | null {
  return value === "free" || value === "plus" ? value : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
