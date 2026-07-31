import type { FurviseMemoryRow } from "../types.ts";
import { calculateMemoryFreshness } from "./calculate-memory-freshness.ts";

export function selectFreshRelevantMemories(memories: FurviseMemoryRow[], message: string, now = new Date(), limit = 20) {
  const terms = new Set(message.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  return memories.map((memory) => {
    const freshness = calculateMemoryFreshness(memory, now);
    const text = `${memory.category} ${memory.fact_key} ${JSON.stringify(memory.fact_value)}`.toLowerCase();
    const subjectScore = [...terms].reduce((score, term) => score + (text.includes(term) ? 10 : 0), 0);
    const importance = memory.importance === "high" ? 3 : memory.importance === "medium" ? 2 : 1;
    const explicit = memory.source_type === "user_confirmed" || memory.confidence >= 0.99 ? 2 : 0;
    const freshnessScore = freshness.freshnessStatus === "fresh" ? 4 : freshness.freshnessStatus === "aging" ? 2 : freshness.freshnessStatus === "stale" ? 0 : -100;
    return { memory, freshness, score: subjectScore + freshnessScore + importance + explicit + freshness.effectiveConfidence };
  }).filter((item) => item.freshness.usableForAnswer).sort((a, b) => b.score - a.score).slice(0, limit);
}
