import type { ProposedSemanticFrame } from "../semantic-frame/types.ts";
import { groundSemanticFrameEvidence } from "../semantic-frame/ground-evidence.ts";
import { validateSemanticFrameEvidence } from "../semantic-frame/validate-evidence.ts";
import { buildRecentPetIds, type EligibleSemanticPet } from "./candidate-retrieval.ts";
import { resolveShadowEntities, type ShadowEntityBinding } from "./resolve-entities.ts";
import { resolveShadowReferences } from "./resolve-references.ts";
import type { SemanticReasonCode } from "./policy.ts";
import {
  buildRecentSubjectState,
  hasExplicitPersonSurface,
  isExplicitExternalAnimalSurface,
  resolveCurrentDiscourseFocus,
  resolveRecentPronoun,
  type RecentSubjectEntity,
} from "./recent-subject-state.ts";

export type AskDiscourseFocus = {
  kind: "pet" | "external_animal" | "person" | "owner" | "other";
  label: string;
  pronouns: Array<"feminine" | "masculine" | "neutral">;
};

export type AuthoritativeTurnSubjectResolution = {
  status: "resolved" | "multi_subject" | "contextual" | "ambiguous" | "unresolved";
  petId: string | null;
  petIds: string[];
  reasonCode: SemanticReasonCode | null;
  requiresClarification: boolean;
  explicitSubject: boolean;
  confidence: number;
  candidatePetIds?: string[];
  candidateLabels?: string[];
  discourseFocus?: AskDiscourseFocus;
};

export type AskTurnSubjectDecision = {
  resolution: AuthoritativeTurnSubjectResolution;
  frame?: ProposedSemanticFrame;
  usedProviderExtraction: boolean;
};

export async function resolveAskTurnSubject({
  extractFrame,
  message,
  ownerId,
  pets,
  recentConversation,
  selectedPetId,
}: {
  extractFrame: () => Promise<ProposedSemanticFrame>;
  message: string;
  ownerId: string;
  pets: EligibleSemanticPet[];
  recentConversation: Array<{ role?: string; text: string }>;
  selectedPetId: string;
}): Promise<AskTurnSubjectDecision> {
  const deterministic = resolveDeterministicTurnSubject({ message, pets, recentConversation, selectedPetId });
  if (deterministic) return { resolution: deterministic, usedProviderExtraction: false };

  const frame = await extractFrame();
  return {
    frame,
    resolution: resolveAuthoritativeTurnSubject({
      frame,
      message,
      ownerId,
      pets,
      recentConversation,
      selectedPetId,
    }),
    usedProviderExtraction: true,
  };
}

export function resolveDeterministicTurnSubject({
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
  const explicitNames = explicitlyNamedOwnedPets(message, pets);
  const discourse = resolveCurrentDiscourseFocus({ message, pets, recentConversation, selectedPetId });
  const explicitPerson = hasExplicitPersonSurface(message) || hasPotentialNamedPersonSurface(message, pets);
  if (isMixedHumanPetPronounAmbiguous(message, explicitNames)) return null;
  if (discourse.status === "resolved" && discourse.entity.kind === "person"
    && (explicitPerson || explicitNames.length === 0)) {
    return contextualNonPet(selectedPetId, discourse.entity, 0.94);
  }
  if (explicitNames.length === 1) return resolved(explicitNames[0].id, 0.99);
  if (explicitNames.length > 1 || isExplicitExternalAnimalSurface(message)) return null;
  const species = explicitOwnedSpecies(message);
  if (species) {
    const compatible = pets.filter((pet) => normalize(pet.species || "") === species);
    if (compatible.length === 1) return resolved(compatible[0].id, 0.98);
    const selected = compatible.find((pet) => pet.id === selectedPetId);
    return selected && !/\b(?:other|another)\b/i.test(message) ? resolved(selected.id, 0.94) : null;
  }
  const normalized = normalize(message);
  if (!normalized) return null;
  if (!pets.some((pet) => pet.id === selectedPetId)) return null;
  const referentialPronounText = message.replace(
    /\b(?:is|was|would)\s+it\s+(?:normal|okay|ok|possible|safe|weird|bad|good)\s+(?:that|if|when|for)\b/gi,
    " ",
  );
  const hasFeminine = /\b(?:she|her|hers)\b/i.test(referentialPronounText);
  const hasMasculine = /\b(?:he|him|his)\b/i.test(referentialPronounText);
  const hasNeutralSurface = /\b(?:they|them|their|theirs|it|its)\b/i.test(referentialPronounText);
  const hasNeutral = hasNeutralSurface && (!hasFeminine && !hasMasculine
    || /(?:^|[.!?;]\s*)(?:(?:and|but|then|now)\s+)?(?:they|it)\b/i.test(referentialPronounText));
  const pronouns = [
    ...(hasFeminine ? ["she"] : []),
    ...(hasMasculine ? ["he"] : []),
    ...(hasNeutral ? ["they"] : []),
  ];
  if (!pronouns.length) return contextual(selectedPetId, 0.9);
  const state = buildRecentSubjectState({ pets, recentConversation, selectedPetId });
  const resolutions = pronouns.map((pronoun) => resolveRecentPronoun(state, pronoun));
  if (!resolutions.every((resolution) => resolution.status === "resolved")) return null;
  const entities = resolutions.map((resolution) => resolution.status === "resolved" ? resolution.entity : null);
  const entityKeys = new Set(entities.flatMap((entity) => entity ? [entity.key] : []));
  const entity = entities[0];
  if (entity && entityKeys.size === 1) {
    return entity.petId ? contextual(entity.petId, 0.92)
      : entity.kind === "person" ? contextualNonPet(selectedPetId, entity, 0.92) : null;
  }
  return null;
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
  if (isMixedHumanPetPronounAmbiguous(message, explicitNames)) {
    const personLabels = currentPersonLabels(message);
    return failed("ambiguous", "ENTITY_AMBIGUOUS", explicitNames.map((pet) => pet.id), [
      ...explicitNames.map((pet) => pet.name || "selected pet"), ...personLabels,
    ]);
  }
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
  const personFocus = resolveFramePersonFocus(grounded, evidence.invalidClaimIds, evidence.invalidMentionIds);
  if (personFocus) return contextualNonPet(selectedPetId, personFocus, personFocus.confidence);
  const recentPetIds = buildRecentPetIds(pets, recentConversation);
  const recentSubjectState = buildRecentSubjectState({ pets, recentConversation, selectedPetId });
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
  const candidatePetIds = new Set<string>();
  const bindingConfidences: number[] = [];
  let failure: ShadowEntityBinding | null = null;
  let externalSubjectCount = 0;
  for (const ref of subjectRefs) {
    if (evidence.invalidMentionIds.includes(ref)) return failed("unresolved", "EVIDENCE_UNSUPPORTED");
    const binding = effective.get(ref);
    if (binding?.status === "resolved" && binding.entityType === "pet" && binding.entityId) {
      petIds.add(binding.entityId);
      bindingConfidences.push(binding.confidence);
      continue;
    }
    const mention = grounded.mentions.find((candidate) => candidate.localId === ref);
    const recent = mention ? resolveRecentPronoun(recentSubjectState, mention.surface) : null;
    if (recent?.status === "resolved") {
      if (recent.entity.petId) {
        petIds.add(recent.entity.petId);
        bindingConfidences.push(0.92);
      } else {
        externalSubjectCount += 1;
      }
      continue;
    }
    if (mention && isExplicitExternalAnimalSurface(mention.surface)) {
      externalSubjectCount += 1;
      continue;
    }
    for (const candidatePetId of recent?.candidatePetIds || []) candidatePetIds.add(candidatePetId);
    for (const candidate of binding?.candidates || []) {
      if (candidate.entityType === "pet" && (candidate.scoreBand === "strong" || candidate.scoreBand === "likely")) {
        candidatePetIds.add(candidate.entityId);
      }
    }
    failure ||= binding || null;
  }
  if (petIds.size > 1) return failed("ambiguous", "ENTITY_AMBIGUOUS", [...petIds]);
  if (petIds.size === 1 && !failure) {
    return resolved([...petIds][0], Math.min(...bindingConfidences));
  }
  if (externalSubjectCount > 0 && !failure) return contextualExternal(selectedPetId);
  if (failure?.status === "ambiguous" || candidatePetIds.size > 1) {
    return failed("ambiguous", failure?.reasonCode || "ENTITY_AMBIGUOUS", [...candidatePetIds]);
  }
  return failed("unresolved", failure?.reasonCode || "ENTITY_NO_MATCH", [...candidatePetIds]);
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

function contextual(selectedPetId: string, confidence = 0.84, discourseFocus?: AskDiscourseFocus): AuthoritativeTurnSubjectResolution {
  return {
    status: "contextual", petId: selectedPetId, petIds: [selectedPetId], reasonCode: null,
    requiresClarification: false, explicitSubject: Boolean(discourseFocus), confidence,
    ...(discourseFocus ? { discourseFocus } : {}),
  };
}

function contextualNonPet(selectedPetId: string, entity: Pick<RecentSubjectEntity, "kind" | "label" | "pronouns">, confidence: number): AuthoritativeTurnSubjectResolution {
  return {
    status: "contextual", petId: selectedPetId, petIds: [], reasonCode: null,
    requiresClarification: false, explicitSubject: true, confidence, discourseFocus: toDiscourseFocus(entity),
  };
}

function contextualExternal(selectedPetId: string): AuthoritativeTurnSubjectResolution {
  return { status: "contextual", petId: selectedPetId, petIds: [], reasonCode: null, requiresClarification: false, explicitSubject: true, confidence: 0.9 };
}

function failed(status: "ambiguous" | "unresolved", reasonCode: SemanticReasonCode, candidatePetIds: string[] = [], candidateLabels: string[] = []): AuthoritativeTurnSubjectResolution {
  return {
    status, petId: null, petIds: [], reasonCode, requiresClarification: true, explicitSubject: true, confidence: 0,
    ...(candidatePetIds.length ? { candidatePetIds: [...new Set(candidatePetIds)] } : {}),
    ...(candidateLabels.length ? { candidateLabels: [...new Set(candidateLabels)] } : {}),
  };
}

function resolved(petId: string, confidence: number, discourseFocus?: AskDiscourseFocus): AuthoritativeTurnSubjectResolution {
  return {
    status: "resolved", petId, petIds: [petId], reasonCode: null, requiresClarification: false, explicitSubject: true, confidence,
    ...(discourseFocus ? { discourseFocus } : {}),
  };
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

function toDiscourseFocus(entity: Pick<RecentSubjectEntity, "kind" | "label" | "pronouns">): AskDiscourseFocus {
  return { kind: entity.kind, label: entity.label, pronouns: entity.pronouns };
}

function hasPotentialNamedPersonSurface(message: string, pets: EligibleSemanticPet[]) {
  const petNames = new Set(pets.map((pet) => normalize(pet.name || "")).filter(Boolean));
  const matches = message.matchAll(/(?:^|[.!?]\s+)([A-Z][\p{L}'-]{1,40})\s+(?:came|said|says|thinks|thought|looks|feels|felt|told|asked|picked|held|called|visited|arrived|is|was)\b/gu);
  return [...matches].some((match) => !petNames.has(normalize(match[1])) && normalize(match[1]) !== "i");
}

function isMixedHumanPetPronounAmbiguous(message: string, namedPets: EligibleSemanticPet[]) {
  if (!namedPets.length || !hasExplicitPersonSurface(message)) return false;
  if (/[.!?]\s+(?:she|he|they)\b/i.test(message)) return false;
  return /\b(?:and|but|then)\s+(?:she|he|they)\b[^.!?]*\b(?:her|him|them)\b/i.test(message);
}

function currentPersonLabels(message: string) {
  return [...message.matchAll(/\b(?:my|our|the|a|an)\s+([\p{L}'-]+)\b/giu)]
    .map((match) => match[0])
    .filter((surface) => hasExplicitPersonSurface(surface));
}

function resolveFramePersonFocus(
  frame: ProposedSemanticFrame,
  invalidClaimIds: string[],
  invalidMentionIds: string[],
): (RecentSubjectEntity & { confidence: number }) | null {
  const validSubjectRefs = new Set(frame.claims
    .filter((claim) => claim.subjectRef && claim.uncertainty.confidence >= 0.8 && !invalidClaimIds.includes(claim.localId))
    .map((claim) => claim.subjectRef!));
  const people = frame.mentions.filter((mention) => mention.coarseType === "person"
    && mention.attributes.ownership !== "owner"
    && validSubjectRefs.has(mention.localId)
    && !invalidMentionIds.includes(mention.localId));
  if (people.length !== 1) return null;
  const mention = people[0];
  return {
    key: `person:${mention.localId}`, kind: "person", petId: null, label: mention.surface,
    species: null, sex: null, pronouns: pronounsFromSurface(mention.surface), lastMentionTurn: 0,
    lastSubjectTurn: 0, grammaticalRole: "subject", confidence: mention.confidence,
  };
}

function pronounsFromSurface(surface: string): AskDiscourseFocus["pronouns"] {
  const value = normalize(surface);
  if (/\b(?:sister|girlfriend|wife|mother|mom|mum|woman|lady|aunt|grandmother|grandma|daughter|niece|she|her)\b/.test(value)) return ["feminine", "neutral"];
  if (/\b(?:brother|boyfriend|husband|father|dad|man|gentleman|uncle|grandfather|grandpa|son|nephew|he|him)\b/.test(value)) return ["masculine", "neutral"];
  return ["feminine", "masculine", "neutral"];
}
