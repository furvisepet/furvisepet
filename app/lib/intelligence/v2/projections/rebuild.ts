import { createHash } from "node:crypto";
import type { ClaimOperation, ClaimRelationType, LifecycleRole, LifecycleTransition } from "../types.ts";

export const V2_REBUILD_VERSION = "ask_v2.shadow_rebuild.v2" as const;

export type RebuildClaim = {
  id: string;
  userId: string;
  subjectType: string;
  subjectId: string | null;
  claimKind: string;
  operationType: ClaimOperation;
  conceptKey: string;
  canonicalConceptKey: string | null;
  conceptResolutionStatus: "canonical" | "provisional" | "ambiguous" | "unresolved";
  lifecycleCapable: boolean;
  lifecycleRole: LifecycleRole | null;
  lifecycleTransition: LifecycleTransition | null;
  persistenceDestination: string;
  knowledgeStatus: "effective" | "tombstoned" | "superseded" | "rejected" | "forgotten" | "dismissed" | "unconfirmed";
  occurredAt: string | null;
  recordedAt: string;
  provenanceClassification: string;
  structuredValue: unknown;
};

export type RebuildRelation = { fromClaimId: string; toClaimId: string; relationType: ClaimRelationType };
export type ShadowRow = { key: string; hash: string; value: Record<string, unknown> };
export type ShadowEpisode = ShadowRow & {
  ownerId: string; subjectId: string; canonicalConceptKey: string; sequence: number;
  status: "active" | "monitoring" | "resolved" | "dismissed"; sourceClaimIds: string[];
};
export type V2ShadowRebuild = {
  reducerVersion: typeof V2_REBUILD_VERSION;
  inputClaimIds: string[];
  effectiveClaimIds: string[];
  history: ShadowRow[];
  memories: ShadowRow[];
  episodes: ShadowEpisode[];
  concerns: ShadowRow[];
  currentState: ShadowRow[];
  invalidLifecycleClaimIds: string[];
  bundleHash: string;
};

export function rebuildSemanticProjectionsV2(claims: readonly RebuildClaim[], relations: readonly RebuildRelation[]): V2ShadowRebuild {
  const ordered = [...claims].sort(compareClaims);
  const byId = new Map(ordered.map((claim) => [claim.id, claim]));
  const excluded = new Set(ordered.filter((claim) => claim.knowledgeStatus !== "effective").map((claim) => claim.id));
  for (const relation of [...relations].sort(compareRelations)) {
    const source = byId.get(relation.fromClaimId);
    if (!source || excluded.has(source.id)) continue;
    if (["retracts", "corrects", "supersedes", "dismisses_lifecycle"].includes(relation.relationType)) excluded.add(relation.toClaimId);
  }
  const effective = ordered.filter((claim) => !excluded.has(claim.id));

  const history = effective.filter((claim) => claim.persistenceDestination === "history")
    .map((claim) => row(`history:${claim.id}`, {
      sourceClaimId: claim.id, ownerId: claim.userId, petId: claim.subjectId,
      occurredAt: claim.occurredAt, recordedAt: claim.recordedAt, provenance: claim.provenanceClassification,
      lifecycleRole: authoritativeLifecycle(claim) ? claim.lifecycleRole : null,
    }));
  const memories = effective.filter((claim) => ["pet_memory", "owner_memory", "relationship"].includes(claim.persistenceDestination))
    .map((claim) => row(`memory:${claim.userId}:${claim.subjectId || "owner"}:${claim.canonicalConceptKey || claim.conceptKey}:${claim.id}`, {
      sourceClaimId: claim.id, ownerId: claim.userId, subjectId: claim.subjectId,
      destination: claim.persistenceDestination, conceptKey: claim.canonicalConceptKey || claim.conceptKey,
      value: claim.structuredValue, provenance: claim.provenanceClassification,
    }));

  const { episodes, invalidLifecycleClaimIds } = rebuildEpisodes(effective);
  const concerns = episodes.filter((episode) => episode.status === "active" || episode.status === "monitoring")
    .map((episode) => row(`concern:${episode.key}`, {
      ownerId: episode.ownerId, petId: episode.subjectId, canonicalConceptKey: episode.canonicalConceptKey,
      episodeKey: episode.key, status: episode.status, sourceClaimIds: episode.sourceClaimIds,
    }));
  const statesByPet = new Map<string, ShadowEpisode[]>();
  for (const episode of episodes.filter((item) => item.status === "active" || item.status === "monitoring")) {
    const key = `${episode.ownerId}:${episode.subjectId}`;
    statesByPet.set(key, [...(statesByPet.get(key) || []), episode]);
  }
  const currentState = [...statesByPet.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, active]) =>
    row(`state:${key}`, {
      ownerId: active[0].ownerId, petId: active[0].subjectId,
      activeConcepts: active.map((item) => item.canonicalConceptKey).sort(),
      episodeKeys: active.map((item) => item.key).sort(),
    }));

  const outputWithoutHash = {
    reducerVersion: V2_REBUILD_VERSION, inputClaimIds: ordered.map((claim) => claim.id),
    effectiveClaimIds: effective.map((claim) => claim.id), history, memories, episodes, concerns,
    currentState, invalidLifecycleClaimIds,
  };
  return { ...outputWithoutHash, bundleHash: stableHash(outputWithoutHash) };
}

function rebuildEpisodes(claims: readonly RebuildClaim[]) {
  const streams = new Map<string, ShadowEpisode[]>();
  const invalidLifecycleClaimIds: string[] = [];
  for (const claim of claims.filter((candidate) => candidate.lifecycleRole)) {
    if (!authoritativeLifecycle(claim) || !claim.subjectId || !claim.canonicalConceptKey) {
      if (claim.lifecycleRole !== "unknown") invalidLifecycleClaimIds.push(claim.id);
      continue;
    }
    const streamKey = `${claim.userId}:${claim.subjectId}:${claim.canonicalConceptKey}`;
    const stream = streams.get(streamKey) || [];
    const open = [...stream].reverse().find((episode) => episode.status === "active" || episode.status === "monitoring");
    if (claim.lifecycleRole === "opening") {
      if (open) { invalidLifecycleClaimIds.push(claim.id); continue; }
      stream.push(episodeFromClaim(claim, stream.length + 1));
    } else if (claim.lifecycleRole === "recurrence") {
      if (open) { invalidLifecycleClaimIds.push(claim.id); continue; }
      stream.push(episodeFromClaim(claim, stream.length + 1));
    } else if (claim.lifecycleRole === "continuation" || claim.lifecycleRole === "worsening" || claim.lifecycleRole === "improvement") {
      if (!open) { invalidLifecycleClaimIds.push(claim.id); continue; }
      open.sourceClaimIds.push(claim.id);
      open.status = claim.lifecycleRole === "improvement" ? "monitoring" : "active";
      refreshEpisode(open);
    } else if (claim.lifecycleRole === "resolution" || claim.lifecycleRole === "dismissal") {
      if (!open) { invalidLifecycleClaimIds.push(claim.id); continue; }
      open.sourceClaimIds.push(claim.id);
      open.status = claim.lifecycleRole === "resolution" ? "resolved" : "dismissed";
      refreshEpisode(open);
    }
    streams.set(streamKey, stream);
  }
  return {
    episodes: [...streams.values()].flat().sort((left, right) => left.key.localeCompare(right.key)),
    invalidLifecycleClaimIds: invalidLifecycleClaimIds.sort(),
  };
}

function episodeFromClaim(claim: RebuildClaim, sequence: number): ShadowEpisode {
  const key = `episode:${claim.userId}:${claim.subjectId}:${claim.canonicalConceptKey}:${sequence}`;
  const episode: ShadowEpisode = {
    key, hash: "", ownerId: claim.userId, subjectId: claim.subjectId!, canonicalConceptKey: claim.canonicalConceptKey!,
    sequence, status: "active", sourceClaimIds: [claim.id], value: {},
  };
  refreshEpisode(episode);
  return episode;
}

function refreshEpisode(episode: ShadowEpisode) {
  episode.value = {
    ownerId: episode.ownerId, petId: episode.subjectId, canonicalConceptKey: episode.canonicalConceptKey,
    sequence: episode.sequence, status: episode.status, sourceClaimIds: [...episode.sourceClaimIds],
  };
  episode.hash = stableHash(episode.value);
}

function authoritativeLifecycle(claim: RebuildClaim) {
  return claim.conceptResolutionStatus === "canonical" && claim.lifecycleCapable && Boolean(claim.canonicalConceptKey);
}

function compareClaims(left: RebuildClaim, right: RebuildClaim) {
  const leftTime = left.occurredAt || left.recordedAt;
  const rightTime = right.occurredAt || right.recordedAt;
  return leftTime.localeCompare(rightTime) || left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id);
}
function compareRelations(left: RebuildRelation, right: RebuildRelation) {
  return left.fromClaimId.localeCompare(right.fromClaimId) || left.toClaimId.localeCompare(right.toClaimId)
    || left.relationType.localeCompare(right.relationType);
}
function row(key: string, value: Record<string, unknown>): ShadowRow {
  return { key, hash: stableHash(value), value };
}
function stableHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
