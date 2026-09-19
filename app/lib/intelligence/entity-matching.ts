import type { DogProfileRow } from "../supabase.ts";
import type { ProposedEntityMention } from "./semantic-frame/types.ts";
import type { ProposedSemanticFrame } from "./semantic-frame/types.ts";

export const SHADOW_ENTITY_RESOLUTION_POLICY = {
  automaticThreshold: 0.84,
  winningMargin: 0.12,
  exactNameScore: 0.99,
  speciesScore: 0.84,
  lifeStageScore: 0.1,
  lifeStageConflictPenalty: 0.35,
  ownershipScore: 0.06,
  selectedPetPrior: 0.06,
  recentDiscourseScore: 0.9,
} as const;

export type SemanticReasonCode =
  | "ENTITY_SPECIES_CONFLICT"
  | "ENTITY_AMBIGUOUS"
  | "ENTITY_NO_MATCH"
  | "REFERENCE_AMBIGUOUS"
  | "REFERENCE_NO_MATCH"
  | "CONCEPT_AMBIGUOUS"
  | "CONCEPT_PROVISIONAL"
  | "EVIDENCE_UNSUPPORTED"
  | "EVIDENCE_EMPTY_SURFACE"
  | "EVIDENCE_NOT_FOUND"
  | "EVIDENCE_AMBIGUOUS"
  | "CLAIM_LOW_CONFIDENCE"
  | "CLAIM_KIND_INCONSISTENT"
  | "CLAIM_ACCEPTED"
  | "CLAIM_NO_PERSISTENCE"
  | "TRANSITION_INCOMPATIBLE"
  | "SHADOW_FRAME_INVALID";

export type EntityScoreBand = "strong" | "likely" | "weak" | "none";

export function entityScoreBand(score: number): EntityScoreBand {
  if (score >= 0.95) return "strong";
  if (score >= SHADOW_ENTITY_RESOLUTION_POLICY.automaticThreshold) return "likely";
  if (score >= 0.5) return "weak";
  return "none";
}

export type EligibleSemanticPet = Pick<DogProfileRow, "id" | "name" | "species" | "age_value" | "age_unit"> & {
  sex?: DogProfileRow["sex"];
};
export type EntityCandidate = {
  entityId: string;
  entityType: "pet" | "owner";
  score: number;
  evidence: Array<"exact_name" | "species" | "life_stage" | "ownership" | "selected_pet_prior" | "recent_discourse">;
  speciesConflict: boolean;
};

export function retrieveEntityCandidates(input: {
  mention: ProposedEntityMention;
  ownerId: string;
  pets: EligibleSemanticPet[];
  recentPetIds: string[];
  selectedPetId: string | null;
}): EntityCandidate[] {
  if (input.mention.coarseType === "person" && input.mention.attributes.ownership === "owner") {
    return [{ entityId: input.ownerId, entityType: "owner", score: 0.99, evidence: ["ownership"], speciesConflict: false }];
  }
  if (input.mention.coarseType !== "animal") return [];
  return input.pets.map((pet) => scorePet(input.mention, pet, input.selectedPetId, input.recentPetIds))
    .sort((left, right) => right.score - left.score || left.entityId.localeCompare(right.entityId));
}

export function buildRecentPetIds(pets: EligibleSemanticPet[], conversation: Array<{ text: string; role?: string }>) {
  const ids: string[] = [];
  const eligibleTurns = conversation.filter((turn) => !turn.role || turn.role === "user").slice(-4);
  for (const turn of [...eligibleTurns].reverse()) {
    const normalizedTurn = normalize(turn.text);
    for (const pet of pets) {
      const name = normalize(pet.name || "");
      if (name && containsTerm(normalizedTurn, name) && !ids.includes(pet.id)) ids.push(pet.id);
    }
  }
  return ids;
}

function scorePet(mention: ProposedEntityMention, pet: EligibleSemanticPet, selectedPetId: string | null, recentPetIds: string[]): EntityCandidate {
  const evidence: EntityCandidate["evidence"] = [];
  const mentionedSpecies = normalize(mention.attributes.species || "");
  const petSpecies = normalize(pet.species || "");
  const speciesConflict = Boolean(mentionedSpecies && petSpecies && mentionedSpecies !== petSpecies);
  if (speciesConflict) return { entityId: pet.id, entityType: "pet", score: 0, evidence, speciesConflict: true };

  let score = 0;
  if (normalize(mention.surface) === normalize(pet.name || "") && normalize(pet.name || "")) {
    score = SHADOW_ENTITY_RESOLUTION_POLICY.exactNameScore;
    evidence.push("exact_name");
  }
  if (mentionedSpecies && petSpecies === mentionedSpecies) {
    score = Math.max(score, SHADOW_ENTITY_RESOLUTION_POLICY.speciesScore);
    evidence.push("species");
  }
  if (mention.attributes.lifeStage) {
    if (compatibleLifeStage(mention.attributes.lifeStage, pet)) {
      score += SHADOW_ENTITY_RESOLUTION_POLICY.lifeStageScore;
      evidence.push("life_stage");
    } else if (pet.age_value && pet.age_unit) {
      score -= SHADOW_ENTITY_RESOLUTION_POLICY.lifeStageConflictPenalty;
    }
  }
  if (mention.attributes.ownership === "owner") {
    score += SHADOW_ENTITY_RESOLUTION_POLICY.ownershipScore;
    evidence.push("ownership");
  }
  if (pet.id === selectedPetId) {
    score += SHADOW_ENTITY_RESOLUTION_POLICY.selectedPetPrior;
    evidence.push("selected_pet_prior");
  }
  const recentIndex = recentPetIds.indexOf(pet.id);
  if (recentIndex >= 0) {
    score = Math.max(score, SHADOW_ENTITY_RESOLUTION_POLICY.recentDiscourseScore - Math.min(0.12, recentIndex * 0.04));
    evidence.push("recent_discourse");
  }
  return { entityId: pet.id, entityType: "pet", score: Math.min(0.99, score), evidence, speciesConflict: false };
}

function compatibleLifeStage(value: string, pet: EligibleSemanticPet) {
  const stage = normalize(value);
  if (!pet.age_value || !pet.age_unit) return false;
  const months = /month/i.test(pet.age_unit) ? pet.age_value : /year/i.test(pet.age_unit) ? pet.age_value * 12 : null;
  if (months === null) return false;
  if (stage === "puppy" || stage === "kitten" || stage === "juvenile") return months < 18;
  if (stage === "adult") return months >= 12 && months < 84;
  if (stage === "senior") return months >= 84;
  return false;
}

function containsTerm(text: string, term: string) {
  return (` ${text} `).includes(` ${term} `);
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

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

export type ShadowReferenceResolution = {
  referenceId: string;
  mentionId: string;
  status: "resolved" | "ambiguous" | "unresolved";
  entityId: string | null;
  entityType: "pet" | "owner" | null;
  confidence: number;
  reasonCode: SemanticReasonCode | null;
};

export function resolveShadowReferences(frame: ProposedSemanticFrame, bindings: ShadowEntityBinding[]): ShadowReferenceResolution[] {
  const byMention = new Map(bindings.map((binding) => [binding.mentionId, binding]));
  return frame.references.map((reference) => {
    const direct = byMention.get(reference.mentionRef);
    if (direct?.status === "resolved") return resolved(reference.localId, reference.mentionRef, direct, reference.confidence);
    const antecedents = reference.antecedentRefs.map((id) => byMention.get(id)).filter((item): item is ShadowEntityBinding => item?.status === "resolved");
    const entityKeys = new Set(antecedents.map((item) => `${item.entityType}:${item.entityId}`));
    if (entityKeys.size === 1 && antecedents[0]) return resolved(reference.localId, reference.mentionRef, antecedents[0], Math.min(reference.confidence, antecedents[0].confidence));
    if (entityKeys.size > 1 || direct?.status === "ambiguous") return failed(reference.localId, reference.mentionRef, "ambiguous", "REFERENCE_AMBIGUOUS");
    return failed(reference.localId, reference.mentionRef, "unresolved", "REFERENCE_NO_MATCH");
  });
}

function resolved(referenceId: string, mentionId: string, binding: ShadowEntityBinding, confidence: number): ShadowReferenceResolution {
  return { referenceId, mentionId, status: "resolved", entityId: binding.entityId, entityType: binding.entityType, confidence, reasonCode: null };
}

function failed(referenceId: string, mentionId: string, status: "ambiguous" | "unresolved", reasonCode: SemanticReasonCode): ShadowReferenceResolution {
  return { referenceId, mentionId, status, entityId: null, entityType: null, confidence: 0, reasonCode };
}
