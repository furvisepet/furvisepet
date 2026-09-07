import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { buildRecentSubjectState, hasExplicitPersonSurface, isExplicitExternalAnimalSurface } from "./entities/recent-subject-state.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";
import type { FurviseLiveContext } from "./types.ts";

type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "pet" | "currentMessage" | "conversationTurns">;
const referenceQuestion = /^(?:and\s+)?(?:do (?:we|you) know (?:its|the medication's) (?:name|dose)|what (?:is|was) (?:its|the medication's) (?:name|dose)|what (?:is|was) (?:it|that medication) called|(?:is|was) (?:its|the medication's) (?:name|dose) (?:recorded|saved|documented)|do the (?:notes|records) (?:name it|give its dose))\s*\?*$/i;

/** Resolve only a read referent. Prior assistant claims never supply identity,
 * medication facts or write authority; the resulting plan re-reads saved notes. */
export function medicationReferencePet(context: Context): { name: string } | null {
  const question = context.currentMessage.trim().replace(/\u2019/g, "'");
  if (!referenceQuestion.test(question) || analyzeOwnerAssertions(question).hasOwnerAssertion) return null;
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  const users = context.conversationTurns.filter(turn => turn.role === "user").slice(-8);
  const state = buildRecentSubjectState({ pets: owned, selectedPetId: context.pet.id, recentConversation: users });
  const focus = state.entities.find(entity => entity.key === state.currentFocusKey);
  if (focus?.kind !== "pet" || !focus.petId) return null;
  const pet = owned.find(candidate => candidate.id === focus.petId);
  if (!pet?.name || owned.filter(candidate => candidate.name?.toLowerCase() === pet.name?.toLowerCase()).length !== 1) return null;
  // Skip only earlier questions of this same narrow kind, not arbitrary turns.
  const anchor = [...users].reverse().find(turn => !referenceQuestion.test(turn.text.trim().replace(/\u2019/g, "'")));
  if (!anchor || !/\b(?:medication|medicine|prescription|drug)\b/i.test(anchor.text)) return null;
  // Multiple treatments, a new non-pet subject or another topic require a
  // clarification. Do not silently choose between competing referents.
  if (/\b(?:medications|medicines|prescriptions|drugs|both|two|three|another|other|and|or|food|litter|toy|brand)\b/i.test(anchor.text)) return null;
  if (hasExplicitPersonSurface(anchor.text) || isExplicitExternalAnimalSurface(anchor.text)) return null;
  if (users.some(turn => /\b(?:two|three|both|multiple|different)\s+(?:medications?|medicines?|prescriptions?|drugs?)\b|\b(?:medications|medicines|prescriptions|drugs)\b/i.test(turn.text))) return null;
  const named = explicitlyNamedOwnedPets(anchor.text, owned);
  if (named.length > 1 || named.some(candidate => candidate.id !== pet.id)) return null;
  const before = buildRecentSubjectState({ pets: owned, selectedPetId: context.pet.id,
    recentConversation: users.slice(0, users.indexOf(anchor) + 1) });
  if (before.currentFocusKey !== state.currentFocusKey) return null;
  return { name: pet.name };
}
