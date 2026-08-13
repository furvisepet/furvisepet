import type { ProposedSemanticFrame } from "../semantic-frame/types.ts";
import { groundSemanticFrameEvidence } from "../semantic-frame/ground-evidence.ts";
import { validateSemanticFrameEvidence } from "../semantic-frame/validate-evidence.ts";
import { buildRecentPetIds, type EligibleSemanticPet } from "./candidate-retrieval.ts";
import { resolveShadowEntities, type ShadowEntityBinding } from "./resolve-entities.ts";
import { resolveShadowReferences } from "./resolve-references.ts";
import type { SemanticReasonCode } from "./policy.ts";

export type AuthoritativeTurnSubjectResolution = {
  status: "resolved" | "multi_subject" | "contextual" | "ambiguous" | "unresolved";
  petId: string | null;
  petIds: string[];
  reasonCode: SemanticReasonCode | null;
  requiresClarification: boolean;
  explicitSubject: boolean;
  confidence: number;
};

export function resolveAuthoritativeTurnSubject({
  frame,
  message,
  ownerId,
  pets,
  recentConversation,
  selectedPetId,
}: {
  frame: ProposedSemanticFrame;
  message: string;
  ownerId: string;
  pets: EligibleSemanticPet[];
  recentConversation: Array<{ role?: string; text: string }>;
  selectedPetId: string;
}): AuthoritativeTurnSubjectResolution {
  const explicitNames = explicitlyNamedOwnedPets(message, pets);
  if (explicitNames.length) {
    const claimedNamedSubjects = explicitlyNamedClaimSubjects(frame);
    if (claimedNamedSubjects.some((surface) => !pets.some((pet) => normalize(pet.name || "") === surface))) {
      return failed("unresolved", "ENTITY_NO_MATCH");
    }
    if (explicitNames.length === 1) return resolved(explicitNames[0].id, 0.99);
    if (!supportsIndependentMultiPetClaims(frame, message, explicitNames.map((pet) => pet.id))) {
      return failed("ambiguous", "ENTITY_AMBIGUOUS");
    }
    return {
      status: "multi_subject", petId: explicitNames[0].id, petIds: explicitNames.map((pet) => pet.id),
      reasonCode: null, requiresClarification: false, explicitSubject: true, confidence: 0.99,
    };
  }

  const explicitSpecies = explicitOwnedSpecies(message);
  if (explicitSpecies) {
    const matching = pets.filter((pet) => normalize(pet.species || "") === explicitSpecies);
    if (matching.length === 1) return resolved(matching[0].id, 0.98);
    return failed(matching.length > 1 ? "ambiguous" : "unresolved", matching.length > 1 ? "ENTITY_AMBIGUOUS" : "ENTITY_NO_MATCH");
  }

  const grounded = groundSemanticFrameEvidence(frame, message).frame;
  const evidence = validateSemanticFrameEvidence(grounded, message);
  const recentPetIds = buildRecentPetIds(pets, recentConversation);
  const bindings = resolveShadowEntities({ frame: grounded, ownerId, pets, recentPetIds, selectedPetId });
  const references = resolveShadowReferences(grounded, bindings);
  const effective = effectiveBindings(bindings, references);
  const animalMentionIds = new Set(grounded.mentions.filter((mention) => mention.coarseType === "animal").map((mention) => mention.localId));
  const subjectRefs = [...new Set(grounded.claims
    .filter((claim) => claim.uncertainty.confidence >= 0.8 && !evidence.invalidClaimIds.includes(claim.localId))
    .map((claim) => claim.subjectRef)
    .filter((ref): ref is string => typeof ref === "string" && animalMentionIds.has(ref)))];

  if (!subjectRefs.length) return contextual(selectedPetId);

  const petIds = new Set<string>();
  const bindingConfidences: number[] = [];
  let failure: ShadowEntityBinding | null = null;
  for (const ref of subjectRefs) {
    if (evidence.invalidMentionIds.includes(ref)) return failed("unresolved", "EVIDENCE_UNSUPPORTED");
    const binding = effective.get(ref);
    if (!binding || binding.status !== "resolved" || binding.entityType !== "pet" || !binding.entityId) {
      failure ||= binding || null;
      continue;
    }
    petIds.add(binding.entityId);
    bindingConfidences.push(binding.confidence);
  }
  if (petIds.size > 1) return failed("ambiguous", "ENTITY_AMBIGUOUS");
  if (petIds.size === 1 && !failure) {
    return resolved([...petIds][0], Math.min(...bindingConfidences));
  }
  if (failure?.status === "ambiguous") return failed("ambiguous", failure.reasonCode || "ENTITY_AMBIGUOUS");
  return failed("unresolved", failure?.reasonCode || "ENTITY_NO_MATCH");
}

function effectiveBindings(bindings: ShadowEntityBinding[], references: ReturnType<typeof resolveShadowReferences>) {
  const result = new Map(bindings.map((binding) => [binding.mentionId, binding]));
  for (const reference of references) {
    if (reference.status !== "resolved") continue;
    result.set(reference.mentionId, {
      mentionId: reference.mentionId, status: "resolved", entityId: reference.entityId,
      entityType: reference.entityType, confidence: reference.confidence, reasonCode: null, candidates: [],
    });
  }
  return result;
}

function contextual(selectedPetId: string): AuthoritativeTurnSubjectResolution {
  return { status: "contextual", petId: selectedPetId, petIds: [selectedPetId], reasonCode: null, requiresClarification: false, explicitSubject: false, confidence: 0.84 };
}

function failed(status: "ambiguous" | "unresolved", reasonCode: SemanticReasonCode): AuthoritativeTurnSubjectResolution {
  return { status, petId: null, petIds: [], reasonCode, requiresClarification: true, explicitSubject: true, confidence: 0 };
}

function resolved(petId: string, confidence: number): AuthoritativeTurnSubjectResolution {
  return { status: "resolved", petId, petIds: [petId], reasonCode: null, requiresClarification: false, explicitSubject: true, confidence };
}

function explicitlyNamedOwnedPets(message: string, pets: EligibleSemanticPet[]) {
  const normalized = ` ${normalize(message)} `;
  return pets.filter((pet) => {
    const name = normalize(pet.name || "");
    return Boolean(name && normalized.includes(` ${name} `));
  });
}

function explicitlyNamedClaimSubjects(frame: ProposedSemanticFrame) {
  const subjectRefs = new Set(frame.claims.map((claim) => claim.subjectRef).filter(Boolean));
  return frame.mentions.filter((mention) => mention.coarseType === "animal" && subjectRefs.has(mention.localId)
    && /^[\p{L}\p{N}'-]+$/u.test(mention.surface.trim()))
    .map((mention) => normalize(mention.surface));
}

function explicitOwnedSpecies(message: string) {
  const match = /\b(?:my|our)\s+(cat|dog)\b/i.exec(message.normalize("NFKC"));
  return match ? normalize(match[1]) : null;
}

function supportsIndependentMultiPetClaims(frame: ProposedSemanticFrame, message: string, namedPetIds: string[]) {
  if (namedPetIds.length < 2 || !frame.claims.length) return false;
  const grounded = groundSemanticFrameEvidence(frame, message).frame;
  const evidence = validateSemanticFrameEvidence(grounded, message);
  if (evidence.invalidClaimIds.length || evidence.invalidMentionIds.length) return false;
  const animalMentions = grounded.mentions.filter((mention) => mention.coarseType === "animal");
  const usedSubjects = new Set(grounded.claims.map((claim) => claim.subjectRef).filter(Boolean));
  const independentlyNamedSubjects = animalMentions.filter((mention) => usedSubjects.has(mention.localId)
    && grounded.claims.some((claim) => claim.subjectRef === mention.localId
      && claim.uncertainty.confidence >= 0.8
      && (claim.kind === "preference" || (claim.kind === "assertion" && claim.durability !== "temporary"))));
  return new Set(independentlyNamedSubjects.map((mention) => normalize(mention.surface))).size >= namedPetIds.length
    && grounded.claims.every((claim) => claim.kind === "preference"
      || (claim.kind === "assertion" && claim.durability !== "temporary"));
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
