import type { AskInterpretation } from "./interpret-ask.ts";

/** Interactive Ask reads one selected pet. Naming another owned pet does not
 * expand this page's read boundary. Ownership and write authority stay separate. */
export function exceedsSelectedPetRead(interpretation: AskInterpretation, selectedPetId: string): boolean {
  if (!["saved_history", "saved_profile"].includes(interpretation.request?.evidenceBasis || "")) return false;
  const subjects = new Set([...interpretation.petIds, ...(interpretation.readPetIds || []),
    ...(interpretation.request?.evidenceNeeds || []).flatMap(need => need.petIds || [])]);
  return [...subjects].some(id => id !== selectedPetId);
}
