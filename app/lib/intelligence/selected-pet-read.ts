import type { AskInterpretation } from "./interpret-ask.ts";

/** The selected pet is the default read boundary. An explicit read-only task may
 * widen to additional owned pets resolved by the server; mutation authority is
 * unchanged and never inherits this read scope. */
export function exceedsSelectedPetRead(interpretation: AskInterpretation, selectedPetId: string,
  ownedPetIds: readonly string[] = [selectedPetId], explicitlyNamedPetIds: readonly string[] = []): boolean {
  if (!["saved_history", "saved_profile"].includes(interpretation.request?.evidenceBasis || "")) return false;
  const subjects = new Set([...interpretation.petIds, ...(interpretation.readPetIds || []),
    ...(interpretation.request?.evidenceNeeds || []).flatMap(need => need.petIds || [])]);
  const wider = [...subjects].some(id => id !== selectedPetId);
  if (!wider) return false;
  const owned = new Set(ownedPetIds);
  const explicit = new Set(explicitlyNamedPetIds);
  const readOnly = interpretation.readOnly && interpretation.request?.mode === "read";
  const explicitOwnedMultiRead = readOnly && subjects.size > 1 && [...subjects].every(id => owned.has(id));
  const explicitOwnedAlternateRead = readOnly && subjects.size === 1
    && [...subjects].every(id => owned.has(id) && explicit.has(id));
  return !(explicitOwnedMultiRead || explicitOwnedAlternateRead);
}
