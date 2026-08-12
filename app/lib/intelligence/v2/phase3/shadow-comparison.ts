import type { FurviseLiveContext } from "../../types.ts";
import type { RebuildClaim, V2ShadowRebuild } from "../projections/rebuild.ts";

export type Phase3ContextCounts = {
  ownerFacts: number;
  petFacts: number;
  preferences: number;
  relationships: number;
  history: number;
  activeEpisodes: number;
  resolvedEpisodes: number;
  concerns: number;
  currentState: number;
  memories: number;
};

export function comparePhase3ShadowContext(input: {
  context: FurviseLiveContext;
  claims: readonly RebuildClaim[];
  rebuild: V2ShadowRebuild;
}) {
  const petId = input.context.pet.id;
  const ownerId = input.context.owner.userId;
  const effective = new Set(input.rebuild.effectiveClaimIds);
  const relevantClaims = input.claims.filter((claim) => effective.has(claim.id)
    && (claim.subjectId === petId || claim.subjectType === "owner" && claim.subjectId === ownerId));
  const relevantMemories = input.context.memories.filter((memory) => memory.pet_id === petId || memory.subject_type === "owner");
  const legacy: Phase3ContextCounts = {
    ownerFacts: relevantMemories.filter((memory) => memory.subject_type === "owner" && !legacyPreference(memory.category) && memory.category !== "relationship").length,
    petFacts: relevantMemories.filter((memory) => memory.subject_type === "pet" && !legacyPreference(memory.category) && memory.category !== "relationship").length,
    preferences: relevantMemories.filter((memory) => legacyPreference(memory.category)).length,
    relationships: relevantMemories.filter((memory) => memory.category === "relationship").length,
    history: input.context.selectedCareEntries.length,
    activeEpisodes: input.context.activeEpisodes.length + input.context.monitoringEpisodes.length,
    resolvedEpisodes: input.context.recentlyResolvedEpisodes.length,
    concerns: input.context.activeConcerns.length,
    currentState: input.context.currentState ? 1 : 0,
    memories: relevantMemories.length,
  };
  const v2: Phase3ContextCounts = {
    ownerFacts: relevantClaims.filter((claim) => claim.subjectType === "owner" && claim.claimKind === "assertion" && memoryDestination(claim.persistenceDestination)).length,
    petFacts: relevantClaims.filter((claim) => claim.subjectType === "pet" && claim.claimKind === "assertion" && memoryDestination(claim.persistenceDestination)).length,
    preferences: relevantClaims.filter((claim) => claim.claimKind === "preference" && memoryDestination(claim.persistenceDestination)).length,
    relationships: relevantClaims.filter((claim) => claim.claimKind === "relationship" && claim.persistenceDestination === "relationship").length,
    history: input.rebuild.history.filter((row) => row.value.petId === petId).length,
    activeEpisodes: input.rebuild.episodes.filter((episode) => episode.subjectId === petId && (episode.status === "active" || episode.status === "monitoring")).length,
    resolvedEpisodes: input.rebuild.episodes.filter((episode) => episode.subjectId === petId && episode.status === "resolved").length,
    concerns: input.rebuild.concerns.filter((row) => row.value.petId === petId).length,
    currentState: input.rebuild.currentState.filter((row) => row.value.petId === petId).length,
    memories: input.rebuild.memories.filter((row) => row.value.subjectId === petId || row.value.subjectId === ownerId).length,
  };
  const divergenceReasons = (Object.keys(legacy) as Array<keyof Phase3ContextCounts>)
    .filter((key) => legacy[key] !== v2[key]);
  return { agrees: divergenceReasons.length === 0, legacy, v2, divergenceReasons, projectionHash: input.rebuild.bundleHash };
}

function legacyPreference(category: string) {
  return category === "preference" || category === "shopping" || category === "budget";
}

function memoryDestination(destination: string) {
  return destination === "owner_memory" || destination === "pet_memory";
}
