import type { FurviseMemoryRow } from "./types.ts";
import { isEligibleStoredMemory, memoryDisplayContent } from "./memory-integrity.ts";

export type FreshnessClass = "permanent" | "long_lived" | "medium_lived" | "short_lived" | "episode_bound";
const day = 86_400_000;
export const memoryFreshnessPolicy: Record<FreshnessClass, { agingAfterMs: number; staleAfterMs: number; expiresAfterMs: number; hardConstraintFloor: number }> = {
  permanent: { agingAfterMs: Infinity, staleAfterMs: Infinity, expiresAfterMs: Infinity, hardConstraintFloor: 1 },
  long_lived: { agingAfterMs: 180 * day, staleAfterMs: 365 * day, expiresAfterMs: 730 * day, hardConstraintFloor: 0.8 },
  medium_lived: { agingAfterMs: 45 * day, staleAfterMs: 90 * day, expiresAfterMs: 180 * day, hardConstraintFloor: 0.9 },
  short_lived: { agingAfterMs: 3 * day, staleAfterMs: 7 * day, expiresAfterMs: 14 * day, hardConstraintFloor: 0.95 },
  episode_bound: { agingAfterMs: day, staleAfterMs: day, expiresAfterMs: 7 * day, hardConstraintFloor: 1 },
};

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

export function selectFreshRelevantMemories(memories: FurviseMemoryRow[], message: string, now = new Date(), limit = 20) {
  const terms = new Set(message.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  return memories.filter(isEligibleStoredMemory).map((memory) => {
    const freshness = calculateMemoryFreshness(memory, now);
    const text = `${memory.category} ${memory.fact_key} ${memoryDisplayContent(memory)}`.toLowerCase();
    const subjectScore = [...terms].reduce((score, term) => score + (text.includes(term) ? 10 : 0), 0);
    const importance = memory.importance === "high" ? 3 : memory.importance === "medium" ? 2 : 1;
    const explicit = memory.source_type === "user_confirmed" || memory.confidence >= 0.99 ? 2 : 0;
    const freshnessScore = freshness.freshnessStatus === "fresh" ? 4 : freshness.freshnessStatus === "aging" ? 2 : freshness.freshnessStatus === "stale" ? 0 : -100;
    return { memory, freshness, score: subjectScore + freshnessScore + importance + explicit + freshness.effectiveConfidence };
  }).filter((item) => item.freshness.usableForAnswer).sort((a, b) => b.score - a.score).slice(0, limit);
}
