import type { ProposedSemanticFrame } from "../semantic-frame/types.ts";
import { retrieveEntityCandidates, type EligibleSemanticPet, type EntityCandidate } from "./candidate-retrieval.ts";
import { entityScoreBand, SHADOW_ENTITY_RESOLUTION_POLICY, type SemanticReasonCode } from "./policy.ts";

export type ShadowEntityBinding = {
  mentionId: string;
  status: "resolved" | "ambiguous" | "unresolved";
  entityId: string | null;
  entityType: "pet" | "owner" | null;
  confidence: number;
  reasonCode: SemanticReasonCode | null;
  candidates: Array<{ entityId: string; entityType: "pet" | "owner"; score: number; scoreBand: ReturnType<typeof entityScoreBand> }>;
};

export function resolveShadowEntities(input: {
  frame: ProposedSemanticFrame;
  ownerId: string;
  pets: EligibleSemanticPet[];
  recentPetIds: string[];
  selectedPetId: string | null;
}): ShadowEntityBinding[] {
  return input.frame.mentions.map((mention) => {
    const candidates = retrieveEntityCandidates({ ...input, mention });
    const eligible = candidates.filter((candidate) => !candidate.speciesConflict && candidate.score > 0);
    const traceCandidates = candidates.map(toTraceCandidate);
    const top = eligible[0];
    const second = eligible[1];
    if (!top) {
      return unresolved(mention.localId, traceCandidates, candidates.some((candidate) => candidate.speciesConflict) ? "ENTITY_SPECIES_CONFLICT" : "ENTITY_NO_MATCH");
    }
    if (top.score < SHADOW_ENTITY_RESOLUTION_POLICY.automaticThreshold) return unresolved(mention.localId, traceCandidates, "ENTITY_NO_MATCH", top.score);
    if (second && top.score - second.score < SHADOW_ENTITY_RESOLUTION_POLICY.winningMargin) {
      return { mentionId: mention.localId, status: "ambiguous", entityId: null, entityType: null, confidence: top.score, reasonCode: "ENTITY_AMBIGUOUS", candidates: traceCandidates };
    }
    return { mentionId: mention.localId, status: "resolved", entityId: top.entityId, entityType: top.entityType, confidence: top.score, reasonCode: null, candidates: traceCandidates };
  });
}

function toTraceCandidate(candidate: EntityCandidate) {
  return { entityId: candidate.entityId, entityType: candidate.entityType, score: candidate.score, scoreBand: entityScoreBand(candidate.score) };
}

function unresolved(mentionId: string, candidates: ShadowEntityBinding["candidates"], reasonCode: SemanticReasonCode, confidence = 0): ShadowEntityBinding {
  return { mentionId, status: "unresolved", entityId: null, entityType: null, confidence, reasonCode, candidates };
}
