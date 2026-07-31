export type FreshnessClass = "permanent" | "long_lived" | "medium_lived" | "short_lived" | "episode_bound";
const day = 86_400_000;
export const memoryFreshnessPolicy: Record<FreshnessClass, { agingAfterMs: number; staleAfterMs: number; expiresAfterMs: number; hardConstraintFloor: number }> = {
  permanent: { agingAfterMs: Infinity, staleAfterMs: Infinity, expiresAfterMs: Infinity, hardConstraintFloor: 1 },
  long_lived: { agingAfterMs: 180 * day, staleAfterMs: 365 * day, expiresAfterMs: 730 * day, hardConstraintFloor: 0.8 },
  medium_lived: { agingAfterMs: 45 * day, staleAfterMs: 90 * day, expiresAfterMs: 180 * day, hardConstraintFloor: 0.9 },
  short_lived: { agingAfterMs: 3 * day, staleAfterMs: 7 * day, expiresAfterMs: 14 * day, hardConstraintFloor: 0.95 },
  episode_bound: { agingAfterMs: day, staleAfterMs: day, expiresAfterMs: 7 * day, hardConstraintFloor: 1 },
};
