import type { FurviseMemoryRow } from "../types.ts";
import { memoryFreshnessPolicy, type FreshnessClass } from "./policy.ts";

export type FreshnessStatus = "fresh" | "aging" | "stale" | "expired";
export function calculateMemoryFreshness(memory: FurviseMemoryRow, now = new Date()): { effectiveConfidence: number; freshnessStatus: FreshnessStatus; needsConfirmation: boolean; usableForAnswer: boolean; usableAsHardConstraint: boolean } {
  const freshnessClass = (memory.freshness_class || classFromDurability(memory.durability)) as FreshnessClass;
  const policy = memoryFreshnessPolicy[freshnessClass];
  const confirmed = Date.parse(memory.last_confirmed_at || memory.observed_at || memory.created_at);
  const age = Math.max(0, now.getTime() - confirmed);
  const explicitExpiry = memory.expires_at ? Date.parse(memory.expires_at) : Infinity;
  const status: FreshnessStatus = now.getTime() >= explicitExpiry || age >= policy.expiresAfterMs ? "expired"
    : age >= policy.staleAfterMs ? "stale" : age >= policy.agingAfterMs ? "aging" : "fresh";
  const base = memory.base_confidence ?? memory.confidence;
  const effectiveConfidence = freshnessClass === "permanent" ? base : Math.max(0, Math.min(base, base * (1 - Math.min(0.8, age / policy.expiresAfterMs * 0.8))));
  const needsConfirmation = status === "stale" || status === "expired" || Boolean(memory.confirmation_required_after && now >= new Date(memory.confirmation_required_after));
  return { effectiveConfidence, freshnessStatus: status, needsConfirmation, usableForAnswer: status !== "expired", usableAsHardConstraint: status === "fresh" && effectiveConfidence >= policy.hardConstraintFloor };
}
function classFromDurability(value: FurviseMemoryRow["durability"]): FreshnessClass { return value === "durable" ? "long_lived" : value === "temporary" ? "short_lived" : "medium_lived"; }
