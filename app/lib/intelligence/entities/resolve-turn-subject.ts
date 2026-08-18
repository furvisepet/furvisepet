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

export function resolveExplicitSelectedPetSubject({
  message,
  pets,
  selectedPetId,
}: {
  message: string;
  pets: EligibleSemanticPet[];
  selectedPetId: string;
}): AuthoritativeTurnSubjectResolution | null {
  const explicitNames = explicitlyNamedOwnedPets(message, pets);
  if (explicitNames.length !== 1 || explicitNames[0].id !== selectedPetId) return null;
  return resolved(selectedPetId, 0.99);
}

/**
 * Resolves a narrow pronoun-only continuation without spending a separate
 * provider call. It deliberately declines mixed pronouns, animal nouns, and
 * other entity signals so outside animals still go through full resolution.
 */
export function resolveClearSelectedPetContinuation({
  message,
  pets,
  recentConversation,
  selectedPetId,
}: {
  message: string;
  pets: EligibleSemanticPet[];
  recentConversation: Array<{ role?: string; text: string }>;
  selectedPetId: string;
}): AuthoritativeTurnSubjectResolution | null {
  const normalized = normalize(message);
  if (!normalized || explicitlyNamedOwnedPets(message, pets).length) return null;
  const hasFeminine = /\b(?:she|her|hers)\b/i.test(message);
  const hasMasculine = /\b(?:he|him|his)\b/i.test(message);
  const hasNeutral = /\b(?:they|them|their|theirs|it|its)\b/i.test(message);
  if (![hasFeminine, hasMasculine, hasNeutral].some(Boolean) || [hasFeminine, hasMasculine, hasNeutral].filter(Boolean).length > 1) return null;
  if (/\b(?:cat|dog|kitten|puppy|animal|pet|male|female|outside|stray|neighbor(?:'s)?|another|other)\b/i.test(message)) return null;
  const selected = pets.find((pet) => pet.id === selectedPetId);
  if (!selected) return null;
  const recentUserTurns = recentConversation.filter((turn) => !turn.role || turn.role === "user").slice(-3).reverse();
  const selectedName = normalize(selected.name || "");
  const selectedSpecies = normalize(selected.species || "");
  const recentlySelected = recentUserTurns.some((turn) => {
    const turnText = normalize(turn.text);
    if (selectedName && containsWholeTerm(turnText, selectedName)) return true;
    return Boolean(selectedSpecies && new RegExp(`\\b(?:my|our) ${escapeRegExp(selectedSpecies)}\\b`, "i").test(turnText));
  });
  return recentlySelected ? contextual(selectedPetId) : null;
}

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
    if (hasUnnamedAnimalClaimSubject(frame, pets)) {
      return failed("ambiguous", "ENTITY_AMBIGUOUS");
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
    const selectedMatch = matching.find((pet) => pet.id === selectedPetId);
    if (selectedMatch) return resolved(selectedMatch.id, 0.96);
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
  const match = /\b(?:my|our|the)\s+(cat|dog)\b/i.exec(message.normalize("NFKC"));
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
      && (claim.kind === "preference" || claim.kind === "assertion" || claim.kind === "event")));
  return new Set(independentlyNamedSubjects.map((mention) => normalize(mention.surface))).size >= namedPetIds.length
    && !hasContradictoryNamedClaims(grounded);
}

function hasUnnamedAnimalClaimSubject(frame: ProposedSemanticFrame, pets: EligibleSemanticPet[]) {
  const subjectRefs = new Set(frame.claims.map((claim) => claim.subjectRef).filter(Boolean));
  const ownedNames = new Set(pets.map((pet) => normalize(pet.name || "")).filter(Boolean));
  return frame.mentions.some((mention) => mention.coarseType === "animal" && subjectRefs.has(mention.localId)
    && !ownedNames.has(normalize(mention.surface)));
}

function hasContradictoryNamedClaims(frame: ProposedSemanticFrame) {
  const polarities = new Map<string, Set<string>>();
  for (const claim of frame.claims) {
    if (!claim.subjectRef || (claim.kind !== "assertion" && claim.kind !== "preference")) continue;
    const predicate = normalize(claim.predicate.label || "");
    if (!predicate) continue;
    const key = `${claim.subjectRef}:${predicate}`;
    const values = polarities.get(key) || new Set<string>();
    values.add(claim.polarity);
    polarities.set(key, values);
  }
  return [...polarities.values()].some((values) => values.size > 1);
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function containsWholeTerm(value: string, term: string) {
  return (` ${value} `).includes(` ${term} `);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
