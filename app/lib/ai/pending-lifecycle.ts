import { classifyUserTurn } from "./turn-classifier.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";

export type PendingLifecycleAssertionKind = "reported_deceased" | "reported_archived";

export type PendingLifecycleAssertion = {
  kind: PendingLifecycleAssertionKind;
  phase: "pending_confirmation";
  petId: string;
  petName: string;
  sourceMessageId: string | null;
  action: FurviseApplicationAction;
};

type ConversationTurnWithActions = {
  role?: string;
  applicationActions?: FurviseApplicationAction[];
};

export function hasPendingReportedLifecycle(
  turns: ConversationTurnWithActions[],
  kind: PendingLifecycleAssertionKind,
) {
  const actionKind = kind === "reported_deceased" ? "pet.mark_deceased" : "pet.archive";
  const terminal = new Set<string>();
  for (const turn of turns) {
    for (const action of turn.applicationActions || []) {
      if (action.kind === actionKind && (action.status === "succeeded" || action.status === "cancelled")) terminal.add(action.id);
    }
  }
  return turns.some((turn) => (turn.applicationActions || []).some((action) =>
    action.kind === actionKind && !terminal.has(action.id) && ["proposed", "confirmation_required", "failed"].includes(action.status),
  ));
}

type EligiblePet = { id: string; name?: string | null; species?: string | null; lifecycle_status?: string | null };

export type PendingLifecycleTurnResolution =
  | { kind: "continuation" }
  | { kind: "contradiction" }
  | { kind: "correction" }
  | { kind: "alternate_pet"; petId: string; petName: string }
  | { kind: "reassigned_death"; petId: string; petName: string };

export type DurableLifecycleCorrection = {
  kind: "reactivate";
  fromStatus: "deceased" | "archived";
};

/**
 * A correction only becomes a durable reactivation proposal when the profile's
 * authoritative state is already non-active. An unconfirmed conversation
 * assertion is handled separately by resolvePendingLifecycleTurn().
 */
export function resolveDurableLifecycleCorrection(input: {
  message: string;
  status: "active" | "deceased" | "archived";
}): DurableLifecycleCorrection | null {
  if (input.status === "active") return null;
  const assertionKind = input.status === "deceased" ? "reported_deceased" : "reported_archived";
  return isExplicitLifecycleCorrection(input.message, assertionKind)
    ? { kind: "reactivate", fromStatus: input.status }
    : null;
}

export function derivePendingLifecycleAssertion(input: {
  turns: ConversationTurnWithActions[];
  pets: EligiblePet[];
}): PendingLifecycleAssertion | null {
  const terminalActionIds = new Set<string>();
  for (const turn of input.turns) {
    for (const action of turn.applicationActions || []) {
      if (isLifecycleAction(action) && (action.status === "succeeded" || action.status === "cancelled")) terminalActionIds.add(action.id);
    }
  }
  for (const turn of [...input.turns].reverse()) {
    for (const action of [...(turn.applicationActions || [])].reverse()) {
      if (!isLifecycleAction(action) || terminalActionIds.has(action.id)) continue;
      const pet = input.pets.find((candidate) => candidate.id === action.petId);
      if (!pet) continue;
      if (action.kind === "pet.mark_deceased" && pet.lifecycle_status === "deceased") continue;
      if (action.kind === "pet.archive" && pet.lifecycle_status === "archived") continue;
      return {
        kind: action.kind === "pet.mark_deceased" ? "reported_deceased" : "reported_archived",
        phase: "pending_confirmation",
        petId: action.petId,
        petName: cleanPetName(pet.name),
        sourceMessageId: action.sourceMessageId || null,
        action: retryablePendingAction(action),
      };
    }
  }
  return null;
}

export function resolvePendingLifecycleTurn(input: {
  assertion: PendingLifecycleAssertion;
  message: string;
  pets: EligiblePet[];
}): PendingLifecycleTurnResolution {
  const alternate = explicitlyReassignedPet(input.message, input.assertion.petId, input.pets);
  if (input.assertion.kind === "reported_deceased" && alternate && reportsDeath(input.message)) {
    return { kind: "reassigned_death", petId: alternate.id, petName: cleanPetName(alternate.name) };
  }
  if (isExplicitLifecycleCorrection(input.message, input.assertion.kind)) return { kind: "correction" };

  const other = alternate || uniquelyReferencedOtherPet(input.message, input.assertion.petId, input.pets);
  if (other) return { kind: "alternate_pet", petId: other.id, petName: cleanPetName(other.name) };
  if (requiresLivingPet(input.message)) return { kind: "contradiction" };
  return { kind: "continuation" };
}

export function isExplicitLifecycleCorrection(message: string, kind: PendingLifecycleAssertionKind = "reported_deceased") {
  const aliveCorrection = /\b(?:alive|not dead|isn't dead|is not dead|didn't die|did not die|never died)\b/i.test(message);
  const retractsAssertion = /\b(?:i (?:was )?joking|i made (?:a|the) mistake|that was (?:a )?mistake|what i said was wrong|i was wrong)\b/i.test(message);
  const cancelsArchive = /\b(?:do not|don't|cancel|stop|never mind|keep)\b[^.!?]{0,60}\b(?:archiv|active|profile)\b/i.test(message);
  return retractsAssertion || (kind === "reported_deceased" ? aliveCorrection : cancelsArchive);
}

export function requiresLivingPet(message: string) {
  if (/\b(?:grief|miss|memorial|remember|history|what happened|passed away|died|death|ashes|burial|cremat)\b/i.test(message)) return false;
  const turn = classifyUserTurn(message);
  if (turn.intent === "product_question" || turn.intent === "vet_preparation") return true;
  const activeCare = /\b(?:feed|food|eat|diet|meal|walk|exercise|toy|play|groom|bath|train|routine|medication|supplement|treat|buy|recommend|vet (?:visit|appointment))\b/i.test(message);
  const activeObservation = /\b(?:is|are|was|were|seems?|appears?)\s+(?:still\s+)?(?:playing|walking|eating|drinking|breathing|sleeping|running|jumping)\b|\b(?:playing|walking|eating|drinking|running|jumping)\s+(?:now|today)\b/i.test(message);
  return activeObservation || activeCare && (/\?|\b(?:should|can|could|what|how|when|which|recommend|need)\b/i.test(message));
}

export function reportsDeath(message: string) {
  return /\b(?:died|is dead|was killed|passed away|euthanized|was put (?:to sleep|down))\b/i.test(message);
}

function explicitlyReassignedPet(message: string, assertedPetId: string, pets: EligiblePet[]) {
  const asserted = pets.find((pet) => pet.id === assertedPetId);
  const named = pets.filter((pet) => containsName(message, pet.name));
  const alternatives = named.filter((pet) => pet.id !== assertedPetId);
  if (alternatives.length !== 1) return null;
  const correctionSemantics = /\b(?:i meant|not|instead|other)\b/i.test(message);
  const assertedNegated = Boolean(asserted?.name && new RegExp(`\\bnot\\s+${escapeRegExp(normalize(asserted.name))}\\b`, "i").test(normalize(message)));
  return correctionSemantics || assertedNegated ? alternatives[0] : null;
}

function uniquelyReferencedOtherPet(message: string, assertedPetId: string, pets: EligiblePet[]) {
  const candidates = pets.filter((pet) => pet.id !== assertedPetId && (pet.lifecycle_status || "active") === "active");
  const named = candidates.filter((pet) => containsName(message, pet.name));
  if (named.length === 1) return named[0];
  const species = /\b(?:my|the)\s+other\s+(cat|dog|pet)\b/i.exec(message)?.[1]?.toLowerCase();
  if (!species) return null;
  const matching = species === "pet" ? candidates : candidates.filter((pet) => normalize(pet.species || "") === species);
  return matching.length === 1 ? matching[0] : null;
}

function isLifecycleAction(action: FurviseApplicationAction) {
  return action.kind === "pet.mark_deceased" || action.kind === "pet.archive";
}

function retryablePendingAction(action: FurviseApplicationAction): FurviseApplicationAction {
  return action.status === "failed" ? { ...action, status: "confirmation_required", resultMessage: null } : action;
}

function containsName(message: string, name?: string | null) {
  const normalizedName = normalize(name || "");
  return Boolean(normalizedName && ` ${normalize(message)} `.includes(` ${normalizedName} `));
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanPetName(value?: string | null) {
  return String(value || "the pet").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "the pet";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
