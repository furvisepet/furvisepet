import type { AskInterpretation } from "./interpret-ask.ts";
import type { FurviseLiveContext } from "./types.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";

type PriorUserReadAuthority = {
  ownerId: string;
  pets: FurviseLiveContext["eligiblePets"];
  turns: FurviseLiveContext["conversationTurns"];
  currentTurnId: string;
};

/** A bound reference can establish read identity, never facts or mutation authority.
 * Only one unambiguous owned subject named by the referenced prior USER turns
 * qualifies. Current explicit names take precedence; assistant/current/unknown
 * references and competing subjects do not widen the selected-pet boundary. */
function referencedReadSubject(interpretation: AskInterpretation, authority: PriorUserReadAuthority): string | null {
  const ids = [...new Set(interpretation.request?.referenceTurnIds || [])];
  if (!ids.length || !authority.currentTurnId) return null;
  const turns = ids.map(id => authority.turns.filter(turn => turn.id === id));
  if (turns.some(matches => matches.length !== 1 || matches[0].role !== "user"
    || matches[0].id === authority.currentTurnId)) return null;
  const owned = authority.pets.filter(pet => pet.user_id === authority.ownerId);
  const subjects = new Set(turns.flatMap(([turn]) => explicitlyNamedOwnedPets(turn.text, owned).map(pet => pet.id)));
  return subjects.size === 1 ? [...subjects][0] : null;
}

/** The selected pet is the default read boundary. An explicit read-only task may
 * widen to additional owned pets resolved by the server; mutation authority is
 * unchanged and never inherits this read scope. */
export function exceedsSelectedPetRead(interpretation: AskInterpretation, selectedPetId: string,
  ownedPetIds: readonly string[] = [selectedPetId], explicitlyNamedPetIds: readonly string[] = [],
  priorUserAuthority?: PriorUserReadAuthority): boolean {
  if (!["saved_history", "saved_profile"].includes(interpretation.request?.evidenceBasis || "")) return false;
  const subjects = new Set([...interpretation.petIds, ...(interpretation.readPetIds || []),
    ...(interpretation.request?.evidenceNeeds || []).flatMap(need => need.petIds || [])]);
  const wider = [...subjects].some(id => id !== selectedPetId);
  if (!wider) return false;
  const owned = new Set(ownedPetIds);
  const explicit = new Set(explicitlyNamedPetIds);
  const readOnly = interpretation.readOnly && interpretation.request?.mode === "read";
  if (readOnly && subjects.size === 1 && !explicit.size && priorUserAuthority) {
    const referenced = referencedReadSubject(interpretation, priorUserAuthority);
    if (referenced) explicit.add(referenced);
  }
  const explicitOwnedMultiRead = readOnly && subjects.size > 1 && [...subjects].every(id => owned.has(id));
  const explicitOwnedAlternateRead = readOnly && subjects.size === 1
    && [...subjects].every(id => owned.has(id) && explicit.has(id));
  return !(explicitOwnedMultiRead || explicitOwnedAlternateRead);
}
