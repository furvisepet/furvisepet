import type { ModelApplicationAction, FurviseApplicationAction } from "../application-actions/types.ts";
import type { IntelligenceCareAction } from "../intelligence/types.ts";
import { hasPendingReportedLifecycle } from "./pending-lifecycle.ts";

export type PetLossContext = "none" | "uncertain_current" | "confirmed_current" | "continuation";

const confirmedLossPattern = /\b(?:died|is dead|was killed|passed away|euthanized|was put (?:to sleep|down))\b/i;
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
