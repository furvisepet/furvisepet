import { normalizeConceptLabel } from "../../concepts/normalize-concept.ts";
import type { GovernedClaimRelation, GovernedSemanticClaim } from "../types.ts";

export type GovernedClaimDuplicate = {
  retainedSourceLocalClaimKey: string;
  collapsedSourceLocalClaimKeys: string[];
};

/**
 * Collapses only claims whose governed meaning is identical. The identity is
 * deliberately stricter than display text and deliberately excludes model
 * concept labels once the registry has supplied canonical identity.
 */
export function deduplicateGovernedClaims(
  claims: readonly GovernedSemanticClaim[],
  relations: readonly GovernedClaimRelation[],
) {
  const groups = new Map<string, GovernedSemanticClaim[]>();
  for (const claim of claims) {
    const identity = governedSemanticIdentity(claim);
    groups.set(identity, [...(groups.get(identity) || []), claim]);
  }

  const aliases = new Map<string, string>();
  const duplicates: GovernedClaimDuplicate[] = [];
  const retainedClaims: GovernedSemanticClaim[] = [];
  for (const groupedClaims of groups.values()) {
    const ordered = [...groupedClaims].sort((a, b) => a.sourceLocalClaimKey.localeCompare(b.sourceLocalClaimKey));
    const retained = mergeEquivalentClaims(ordered);
    retainedClaims.push(retained);
    for (const claim of ordered) aliases.set(claim.sourceLocalClaimKey, retained.sourceLocalClaimKey);
    if (ordered.length > 1) {
      duplicates.push({
        retainedSourceLocalClaimKey: retained.sourceLocalClaimKey,
        collapsedSourceLocalClaimKeys: ordered.slice(1).map((claim) => claim.sourceLocalClaimKey),
      });
    }
  }

  const remappedRelations = new Map<string, GovernedClaimRelation>();
  for (const relation of relations) {
    const fromLocalClaimKey = aliases.get(relation.fromLocalClaimKey) || relation.fromLocalClaimKey;
    const toLocalClaimKey = relation.toLocalClaimKey
      ? aliases.get(relation.toLocalClaimKey) || relation.toLocalClaimKey
      : null;
    if (toLocalClaimKey && fromLocalClaimKey === toLocalClaimKey) continue;
    const remapped = { ...relation, fromLocalClaimKey, toLocalClaimKey };
    const identity = stableJson({
      fromLocalClaimKey,
      toLocalClaimKey,
      toClaimId: relation.toClaimId,
      relationType: relation.relationType,
      metadata: relation.metadata,
    });
    const prior = remappedRelations.get(identity);
    if (!prior || remapped.sourceLocalRelationKey.localeCompare(prior.sourceLocalRelationKey) < 0) {
      remappedRelations.set(identity, remapped);
    }
  }

  return {
    claims: retainedClaims.sort((a, b) => a.sourceLocalClaimKey.localeCompare(b.sourceLocalClaimKey)),
    relations: [...remappedRelations.values()].sort((a, b) => a.sourceLocalRelationKey.localeCompare(b.sourceLocalRelationKey)),
    duplicates: duplicates.sort((a, b) => a.retainedSourceLocalClaimKey.localeCompare(b.retainedSourceLocalClaimKey)),
  };
}

export function governedSemanticIdentity(claim: GovernedSemanticClaim) {
  return stableJson({
    operationType: claim.operationType,
    subject: { type: claim.subject.type, id: claim.subject.id, resolution: claim.subject.resolution },
    concept: claim.conceptResolutionStatus === "canonical"
      ? { status: "canonical", key: claim.canonicalConceptKey, version: claim.conceptVersion }
      : { status: "provisional", key: claim.conceptKey, version: claim.conceptVersion },
    claimKind: claim.claimKind,
    structuredValue: semanticStructuredValue(claim),
    unit: normalizeString(claim.unit),
    polarity: claim.proposed.polarity,
    modality: claim.proposed.modality,
    durability: claim.durability,
    temporal: claim.temporal,
    lifecycleRole: claim.lifecycleRole,
    lifecycleTransition: claim.lifecycleTransition,
    serverEpisodeId: claim.serverEpisodeId,
    persistenceDestination: claim.persistenceDestination,
  });
}

function semanticStructuredValue(claim: GovernedSemanticClaim) {
  const value = claim.structuredValue as Record<string, unknown> | null;
  if (claim.claimKind === "preference" && value && typeof value === "object") {
    const object = value.object as Record<string, unknown> | null;
    return {
      preference: value.preference,
      value: object?.value,
      constraints: value.constraints,
    };
  }
  if (claim.claimKind === "relationship" && value && typeof value === "object") {
    return {
      qualifiers: value.qualifiers,
      entities: claim.resolvedEntities.map((entity) => ({ type: entity.entityType, id: entity.entityId }))
        .sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)),
    };
  }
  return value;
}

function mergeEquivalentClaims(claims: GovernedSemanticClaim[]): GovernedSemanticClaim {
  const retained = claims[0];
  if (claims.length === 1) return retained;
  const evidence = new Map<string, GovernedSemanticClaim["groundedEvidence"][number]>();
  const entities = new Map<string, GovernedSemanticClaim["resolvedEntities"][number]>();
  const modelProposals = claims.flatMap(modelProposalsForClaim);
  for (const claim of claims) {
    for (const item of claim.groundedEvidence) evidence.set(stableJson(item), item);
    for (const entity of claim.resolvedEntities) entities.set(`${entity.entityType}:${entity.entityId}`, entity);
  }
  return {
    ...retained,
    groundedEvidence: [...evidence.values()].sort((a, b) => a.start - b.start || a.end - b.end || a.quote.localeCompare(b.quote)),
    resolvedEntities: [...entities.values()].sort((a, b) => `${a.entityType}:${a.entityId}`.localeCompare(`${b.entityType}:${b.entityId}`)),
    extractionConfidence: Math.max(...claims.map((claim) => claim.extractionConfidence)),
    governedConfidence: Math.max(...claims.map((claim) => claim.governedConfidence)),
    governanceMetadata: {
      ...retained.governanceMetadata,
      deduplicatedClaimCount: modelProposals.length,
      deduplicatedModelProposals: modelProposals,
    },
  };
}

function modelProposalsForClaim(claim: GovernedSemanticClaim) {
  const existing = claim.governanceMetadata.deduplicatedModelProposals;
  if (Array.isArray(existing) && existing.length > 0) return existing;
  return [{
    sourceLocalClaimKey: claim.sourceLocalClaimKey,
    declaredClaimKind: claim.proposed.kind,
    proposedConceptKey: normalizeConceptLabel(claim.proposed.predicate.label),
  }];
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") return normalizeString(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => [key, normalizeValue(child)]));
}

function normalizeString(value: string | null) {
  return value === null ? null : value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
