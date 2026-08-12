import type { GovernedSemanticClaim } from "../types.ts";

export const V2_PROJECTION_VERSIONS = {
  bundle: "ask_v2.shadow.projections.v1",
  history: "ask_v2.history.v1",
  memories: "ask_v2.memories.v1",
  episodes: "ask_v2.episodes.v1",
  concerns: "ask_v2.concerns.v1",
  currentState: "ask_v2.current_state.v1",
} as const;

export type V2ProjectionName = Exclude<keyof typeof V2_PROJECTION_VERSIONS, "bundle">;
export type V2ProjectionRecord = {
  projection: V2ProjectionName;
  version: string;
  sourceClaimKey: string;
  subjectId: string | null;
  conceptKey: string;
  payload: Record<string, unknown>;
};

export type V2ProjectionRebuild = {
  bundleVersion: typeof V2_PROJECTION_VERSIONS.bundle;
  inputClaimKeys: string[];
  records: V2ProjectionRecord[];
};

/** Pure, deterministic Phase 1 rebuild contract. It performs no writes. */
export function planV2ProjectionRebuild(claims: GovernedSemanticClaim[]): V2ProjectionRebuild {
  const ordered = [...claims].sort((left, right) =>
    (left.temporal.occurredAt || "").localeCompare(right.temporal.occurredAt || "")
    || left.sourceLocalClaimKey.localeCompare(right.sourceLocalClaimKey));
  return {
    bundleVersion: V2_PROJECTION_VERSIONS.bundle,
    inputClaimKeys: ordered.map((claim) => claim.sourceLocalClaimKey),
    records: ordered.flatMap(projectClaim),
  };
}

function projectClaim(claim: GovernedSemanticClaim): V2ProjectionRecord[] {
  const base = { sourceClaimKey: claim.sourceLocalClaimKey, subjectId: claim.subject.id, conceptKey: claim.canonicalConceptKey || claim.conceptKey };
  const records: V2ProjectionRecord[] = [];
  if (claim.persistenceDestination === "history") records.push({ ...base, projection: "history", version: V2_PROJECTION_VERSIONS.history, payload: { claimKind: claim.claimKind } });
  if (claim.persistenceDestination === "pet_memory" || claim.persistenceDestination === "owner_memory") records.push({ ...base, projection: "memories", version: V2_PROJECTION_VERSIONS.memories, payload: { destination: claim.persistenceDestination } });
  if (claim.lifecycleRole) {
    records.push({ ...base, projection: "episodes", version: V2_PROJECTION_VERSIONS.episodes, payload: { role: claim.lifecycleRole, transition: claim.lifecycleTransition } });
    records.push({ ...base, projection: "concerns", version: V2_PROJECTION_VERSIONS.concerns, payload: { role: claim.lifecycleRole } });
  }
  if (claim.persistenceDestination === "current_state" || claim.lifecycleRole) records.push({ ...base, projection: "currentState", version: V2_PROJECTION_VERSIONS.currentState, payload: { transition: claim.lifecycleTransition } });
  return records;
}
