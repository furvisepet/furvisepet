import type { DogProfileRow } from "../../supabase.ts";
import type { ProposedEntityMention } from "../semantic-frame/types.ts";
import { SHADOW_ENTITY_RESOLUTION_POLICY } from "./policy.ts";

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
