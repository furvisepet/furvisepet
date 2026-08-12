import { createHash } from "node:crypto";
import type { ClaimOperation, ClaimRelationType, LifecycleRole, LifecycleTransition } from "../types.ts";

export const V2_REBUILD_VERSION = "ask_v2.shadow_rebuild.v3" as const;

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
  ambiguousOperationClaimIds: string[];
  invalidRelationClaimIds: string[];
  bundleHash: string;
};

export function rebuildSemanticProjectionsV2(claims: readonly RebuildClaim[], relations: readonly RebuildRelation[]): V2ShadowRebuild {
  const ordered = [...claims].sort(compareClaims);
  const graph = resolveEffectiveClaimGraph(ordered, relations);
  const effective = ordered.filter((claim) => graph.effectiveClaimIds.has(claim.id));

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
    ambiguousOperationClaimIds: graph.ambiguousOperationClaimIds,
    invalidRelationClaimIds: graph.invalidRelationClaimIds,
  };
  return { ...outputWithoutHash, bundleHash: stableHash(outputWithoutHash) };
}

const REPLACEMENT_RELATIONS = new Set<ClaimRelationType>(["corrects", "supersedes"]);
const CLAIM_REMOVING_RELATIONS = new Set<ClaimRelationType>(["retracts", "corrects", "supersedes"]);

/**
 * Effective knowledge is a graph result, never an iteration result.
 *
 * A governed source (never rejected or unconfirmed) permanently authors its
 * outgoing operation. Later tombstoning, forgetting, replacement, or
 * retraction of that source does not revive its earlier target. Competing live
 * replacement heads fail closed. Lifecycle dismissal is deliberately not a
 * claim deletion: its dismissal claim is applied by the lifecycle reducer and
 * History/audit provenance remains.
 */
function resolveEffectiveClaimGraph(claims: readonly RebuildClaim[], relations: readonly RebuildRelation[]) {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const intrinsicallyIneffective = new Set(claims
    .filter((claim) => claim.knowledgeStatus !== "effective")
    .map((claim) => claim.id));
  const cannotAuthorOperation = new Set(claims
    .filter((claim) => claim.knowledgeStatus === "rejected" || claim.knowledgeStatus === "unconfirmed")
    .map((claim) => claim.id));
  const invalidRelationClaimIds = new Set<string>();
  const destructive: RebuildRelation[] = [];

  for (const relation of canonicalRelations(relations)) {
    const source = byId.get(relation.fromClaimId);
    const target = byId.get(relation.toClaimId);
    if (!source || !target || source.id === target.id || cannotAuthorOperation.has(source.id)) {
      if (source) invalidRelationClaimIds.add(source.id);
      continue;
    }
    if (relation.relationType === "confirms" || relation.relationType === "derived_from") continue;
    if (source.recordedAt < target.recordedAt) {
      invalidRelationClaimIds.add(source.id);
      continue;
    }
    destructive.push(relation);
  }

  const cycleClaims = destructiveCycleClaims(destructive);
  for (const claimId of cycleClaims) invalidRelationClaimIds.add(claimId);
  const validDestructive = destructive.filter((relation) =>
    !cycleClaims.has(relation.fromClaimId) && !cycleClaims.has(relation.toClaimId));
  const removedByOperation = new Set(validDestructive
    .filter((relation) => CLAIM_REMOVING_RELATIONS.has(relation.relationType))
    .map((relation) => relation.toClaimId));

  const replacementChildren = new Map<string, string[]>();
  for (const relation of validDestructive.filter((candidate) => REPLACEMENT_RELATIONS.has(candidate.relationType))) {
    replacementChildren.set(relation.toClaimId, [...(replacementChildren.get(relation.toClaimId) || []), relation.fromClaimId]);
  }
  for (const children of replacementChildren.values()) children.sort();
  const retracted = new Set(validDestructive
    .filter((relation) => relation.relationType === "retracts")
    .map((relation) => relation.toClaimId));
  const ambiguous = new Set<string>(cycleClaims);
  for (const targetId of [...replacementChildren.keys()].sort()) {
    const heads = terminalReplacementHeads(targetId, replacementChildren, retracted);
    if (heads.length > 1) for (const head of heads) ambiguous.add(head);
  }

  const effectiveClaimIds = new Set(claims
    .filter((claim) => !intrinsicallyIneffective.has(claim.id)
      && !removedByOperation.has(claim.id)
      && !ambiguous.has(claim.id)
      && !invalidRelationClaimIds.has(claim.id))
    .map((claim) => claim.id));
  return {
    effectiveClaimIds,
    ambiguousOperationClaimIds: [...ambiguous].sort(),
    invalidRelationClaimIds: [...invalidRelationClaimIds].sort(),
  };
}

function canonicalRelations(relations: readonly RebuildRelation[]) {
  const unique = new Map<string, RebuildRelation>();
  for (const relation of relations) {
    const key = `${relation.fromClaimId}:${relation.toClaimId}:${relation.relationType}`;
    unique.set(key, relation);
  }
  return [...unique.values()].sort(compareRelations);
}

function terminalReplacementHeads(
  targetId: string,
  childrenByTarget: ReadonlyMap<string, string[]>,
  retracted: ReadonlySet<string>,
  visiting = new Set<string>(),
): string[] {
  if (visiting.has(targetId)) return [];
  const nextVisiting = new Set(visiting).add(targetId);
  const heads = new Set<string>();
  for (const childId of childrenByTarget.get(targetId) || []) {
    const descendants = terminalReplacementHeads(childId, childrenByTarget, retracted, nextVisiting);
    if (descendants.length) for (const descendant of descendants) heads.add(descendant);
    else if (!retracted.has(childId)) heads.add(childId);
  }
  return [...heads].sort();
}

function destructiveCycleClaims(relations: readonly RebuildRelation[]) {
  const outgoing = new Map<string, string[]>();
  for (const relation of relations) outgoing.set(relation.fromClaimId, [...(outgoing.get(relation.fromClaimId) || []), relation.toClaimId]);
  const cycles = new Set<string>();
  const visited = new Set<string>();
  const stack = new Set<string>();
  const visit = (claimId: string) => {
    if (stack.has(claimId)) { for (const member of stack) cycles.add(member); return; }
    if (visited.has(claimId)) return;
    visited.add(claimId);
    stack.add(claimId);
    for (const targetId of outgoing.get(claimId) || []) visit(targetId);
    stack.delete(claimId);
  };
  for (const claimId of [...outgoing.keys()].sort()) visit(claimId);
  return cycles;
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
