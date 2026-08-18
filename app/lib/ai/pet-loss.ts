import type { ModelApplicationAction, FurviseApplicationAction } from "../application-actions/types.ts";
import type { IntelligenceCareAction } from "../intelligence/types.ts";
import { hasPendingReportedLifecycle } from "./pending-lifecycle.ts";

export type PetLossContext = "none" | "uncertain_current" | "confirmed_current" | "continuation";

const confirmedLossPattern = /\b(?:died|is dead|was killed|passed (?:away|on)|pass?d away|euthani[sz]ed|was put (?:to sleep|down)|put (?:her|him|them|it) (?:to sleep|down)|did(?:n['’]?t| not) make it)\b/i;
const uncertaintyPattern = /\b(?:i think|i thought|maybe|may|might|possibly|probably|not (?:completely )?sure|uncertain|could have|what if|if only)\b/i;
const correctedLossPattern = /\b(?:but|actually|correction)[^.!?]{0,80}\b(?:alive|did not die|didn't die|is not dead|isn't dead)\b/i;

export function classifyCurrentPetLoss(message: string): Exclude<PetLossContext, "continuation"> {
  const death = confirmedLossPattern.exec(message);
  if (!death) return "none";
  if (correctedLossPattern.test(message.slice(death.index))) return "none";
  const evidenceWindow = message.slice(Math.max(0, death.index - 80), death.index + death[0].length + 30);
  const questionWithoutStatement = message.trim().endsWith("?") && /^(?:did|has|is|was|could|would|what if)\b/i.test(message.trim());
  return uncertaintyPattern.test(evidenceWindow) || questionWithoutStatement ? "uncertain_current" : "confirmed_current";
}

export type LossSubjectPet = {
  id: string;
  name?: string | null;
  species?: string | null;
  lifecycle_status?: string | null;
};

export type ProviderIndependentLossSubject =
  | { kind: "resolved"; petId: string; petName: string; lifecycleStatus: string }
  | { kind: "clarification"; candidateNames: string[] }
  | { kind: "external_subject" };

/**
 * Resolves only evidence that is safe enough to bind a high-impact lifecycle
 * assertion without asking a model. Ambiguity is an explicit result, never an
 * invitation to fall back to the selected profile.
 */
export function resolveProviderIndependentLossSubject(input: {
  message: string;
  pets: LossSubjectPet[];
  recentConversation?: Array<{ role?: string; text: string }>;
  selectedPetId: string;
}): ProviderIndependentLossSubject | null {
  if (classifyCurrentPetLoss(input.message) !== "confirmed_current") return null;
  if (hasExternalAnimalSubject(input.message)) return { kind: "external_subject" };

  const pets = input.pets.filter((pet) => pet.id && pet.name);
  const named = pets.filter((pet) => containsWholeTerm(input.message, pet.name || ""));
  if (named.length === 1) return resolvedLossPet(named[0]);
  if (named.length > 1) {
    const reassigned = explicitlyReassignedNamedPet(input.message, named, input.selectedPetId);
    return reassigned ? resolvedLossPet(reassigned) : clarification(named);
  }

  const speciesReference = explicitOwnedSpeciesReference(input.message);
  if (speciesReference) {
    const compatible = pets.filter((pet) => normalize(pet.species || "") === speciesReference.species);
    if (speciesReference.other) {
      const alternatives = compatible.filter((pet) => pet.id !== input.selectedPetId);
      return alternatives.length === 1 ? resolvedLossPet(alternatives[0]) : clarification(alternatives.length ? alternatives : compatible);
    }
    if (compatible.length === 1) return resolvedLossPet(compatible[0]);
    const contextual = recentlyEstablishedSelectedPet(input.recentConversation || [], pets, input.selectedPetId);
    if (contextual && compatible.some((pet) => pet.id === contextual.id)) return resolvedLossPet(contextual);
    return clarification(compatible);
  }

  if (/\b(?:my|our)\s+pet\b/i.test(input.message)) {
    if (pets.length === 1) return resolvedLossPet(pets[0]);
    const contextual = recentlyEstablishedSelectedPet(input.recentConversation || [], pets, input.selectedPetId);
    return contextual ? resolvedLossPet(contextual) : clarification(pets);
  }

  const hasPronounSubject = /\b(?:she|he|they|it)\b/i.test(input.message);
  const implicitEuthanasiaSubject = /\b(?:put (?:her|him|them|it) to sleep|euthani[sz]ed (?:her|him|them|it))\b/i.test(input.message);
  if (hasPronounSubject || implicitEuthanasiaSubject || pets.length === 1) {
    if (pets.length === 1) return resolvedLossPet(pets[0]);
    const contextual = recentlyEstablishedSelectedPet(input.recentConversation || [], pets, input.selectedPetId);
    return contextual ? resolvedLossPet(contextual) : clarification(pets);
  }

  return clarification(pets);
}

export function resolvePetLossContext(input: {
  message: string;
  recentConversation?: Array<{ role?: string; text: string }>;
  lifecycleStatus?: string | null;
  petName?: string | null;
}): PetLossContext {
  const current = classifyCurrentPetLoss(input.message);
  if (current !== "none") return current;
  if (input.lifecycleStatus === "deceased") return "continuation";
  return hasPendingReportedLifecycle(input.recentConversation || [], "reported_deceased") ? "continuation" : "none";
}

export function ensureConfirmedLossAction(
  proposals: ModelApplicationAction[],
  evidenceMessage: string,
  options: { exclusive?: boolean } = {},
) {
  if (classifyCurrentPetLoss(evidenceMessage) !== "confirmed_current") return proposals;
  const lifecycleAction = proposals.find((proposal) => proposal.kind === "pet.mark_deceased")
    || confirmedLossActionProposal(evidenceMessage);
  if (options.exclusive) return [lifecycleAction];
  if (proposals.includes(lifecycleAction)) return proposals;
  return [...proposals, lifecycleAction].slice(0, 3);
}

export function buildConfirmedLossCareAction(input: { message: string; petName: string }): IntelligenceCareAction | null {
  if (classifyCurrentPetLoss(input.message) !== "confirmed_current") return null;
  const petName = cleanPetName(input.petName);
  const cause = reportedDeathCause(input.message);
  return {
    action: "create_entry",
    category: "general",
    title: cause.title ? `${petName} died ${cause.title}` : `${petName} died`,
    details: `Owner reported that ${petName} died${cause.detail}.`,
    severity: "moderate",
    confidence: 0.99,
    relatedRecordId: null,
  };
}

export function buildUnavailableConfirmedLossAction(input: {
  message: string;
  petId: string;
  petName: string;
  requestId: string;
}): FurviseApplicationAction | null {
  if (classifyCurrentPetLoss(input.message) !== "confirmed_current") return null;
  const proposal = confirmedLossActionProposal(input.message);
  return {
    ...proposal,
    id: `${input.requestId}:lifecycle-unavailable`,
    petId: input.petId,
    safetyClass: "CONFIRMATION_REQUIRED",
    mutationClass: "mutation",
    confirmationPolicy: "always",
    authorizationScope: "owned_pet",
    status: "failed",
    label: `Mark ${cleanPetName(input.petName)} as passed away`,
    description: `Keep ${cleanPetName(input.petName)}'s history while stopping future-care experiences.`,
    href: null,
    resultMessage: null,
    errorMessage: "The lifecycle confirmation could not be prepared. The reported loss remains available in this conversation, but no profile, history, or memory was changed.",
  };
}

export function buildGriefResponseFallback(petName: string) {
  const pet = cleanPetName(petName);
  return `I'm so sorry. ${pet}'s history can stay in Furvise. Marking ${pet} as passed away is a separate confirmation, so nothing will be deleted automatically.`;
}

function confirmedLossActionProposal(message: string): ModelApplicationAction {
  return {
    kind: "pet.mark_deceased",
    input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
    evidence: deathEvidence(message),
    explicitIntent: false,
  };
}

function deathEvidence(message: string) {
  const sentence = message.split(/(?<=[.!?])\s+/).find((part) => confirmedLossPattern.test(part)) || message;
  return sentence.trim().slice(0, 240);
}

function hasExternalAnimalSubject(message: string) {
  return /\b(?:stray|feral|wild|outside|neighbou?r(?:'s|’s)?|someone else(?:'s|’s)?|not (?:my|our))\s+(?:cat|dog|animal|pet)\b/i.test(message);
}

function explicitOwnedSpeciesReference(message: string) {
  const match = /\b(?:my|our|the)\s+(other\s+)?(cat|dog)\b/i.exec(message.normalize("NFKC"));
  return match ? { other: Boolean(match[1]), species: normalize(match[2]) } : null;
}

function explicitlyReassignedNamedPet(message: string, named: LossSubjectPet[], selectedPetId: string) {
  if (!/\b(?:i meant|not|instead)\b/i.test(message)) return null;
  const alternatives = named.filter((pet) => pet.id !== selectedPetId);
  if (alternatives.length !== 1) return null;
  const selected = named.find((pet) => pet.id === selectedPetId);
  const selectedNegated = Boolean(selected?.name && new RegExp(`\\bnot\\s+${escapeRegExp(normalize(selected.name))}\\b`, "i").test(normalize(message)));
  return /\bi meant\b/i.test(message) || selectedNegated ? alternatives[0] : null;
}

function recentlyEstablishedSelectedPet(
  recentConversation: Array<{ role?: string; text: string }>,
  pets: LossSubjectPet[],
  selectedPetId: string,
) {
  const selected = pets.find((pet) => pet.id === selectedPetId);
  if (!selected?.name) return null;
  const recentUserTurns = recentConversation.filter((turn) => !turn.role || turn.role === "user").slice(-3);
  return recentUserTurns.some((turn) => containsWholeTerm(turn.text, selected.name || "")) ? selected : null;
}

function clarification(pets: LossSubjectPet[]): ProviderIndependentLossSubject {
  return { kind: "clarification", candidateNames: [...new Set(pets.map((pet) => cleanPetName(pet.name || "")).filter(Boolean))].slice(0, 4) };
}

function resolvedLossPet(pet: LossSubjectPet): ProviderIndependentLossSubject {
  return {
    kind: "resolved",
    petId: pet.id,
    petName: cleanPetName(pet.name || "the pet"),
    lifecycleStatus: pet.lifecycle_status || "active",
  };
}

function containsWholeTerm(message: string, term: string) {
  const normalizedTerm = normalize(term);
  return Boolean(normalizedTerm && ` ${normalize(message)} `.includes(` ${normalizedTerm} `));
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reportedDeathCause(message: string) {
  const dogNeckBite = /\bdog\b[\s\S]{0,100}\b(?:bit|bite|attacked|mauled)\b[\s\S]{0,60}\bneck\b|\bneck\b[\s\S]{0,60}\b(?:bit|bite|attacked|mauled)\b[\s\S]{0,100}\bdog\b/i.test(message);
  if (dogNeckBite) return { title: "after a dog attack", detail: " after being bitten on the neck by a dog" };
  const dogAttack = /\bdog\b[\s\S]{0,100}\b(?:bit|bite|attacked|mauled)\b|\b(?:bitten|attacked|mauled)\b[\s\S]{0,100}\b(?:by )?a dog\b/i.test(message);
  if (dogAttack) return { title: "after a dog attack", detail: " after an attack by a dog" };
  const vehicle = /\b(?:car|truck|vehicle)\b[\s\S]{0,80}\b(?:hit|struck|ran over)\b|\b(?:hit|struck|run over|ran over)\b[\s\S]{0,80}\b(?:car|truck|vehicle)\b/i.test(message);
  if (vehicle) return { title: "after being struck by a vehicle", detail: " after being struck by a vehicle" };
  if (/\beuthanized|put (?:to sleep|down)\b/i.test(message)) return { title: "after euthanasia", detail: " after euthanasia" };
  return { title: "", detail: "" };
}

function cleanPetName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "the pet";
}
