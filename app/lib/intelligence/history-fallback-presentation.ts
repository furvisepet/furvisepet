import type { AskEvidenceContract } from "./ask-evidence.ts";

export const SAVED_NOTES_HEADING = "Saved notes";

/** Keep a declined answer honest without making raw records the companion's
 * voice. The attributed notes remain intact and part of the validated body. */
export function historyFallbackPresentation(evidence: AskEvidenceContract, text: string) {
  if (!evidence.interpretation?.request || !evidence.answerContent?.length
    || evidence.scope.requestKind === "record_lookup"
    || /\b(?:quote|verbatim|exact wording)\b/i.test(evidence.scope.requestText)) {
    return { summary: text, sections: [] };
  }
  const names = evidence.scope.authorizedPetIds.map(id => evidence.petNames?.[id]).filter(Boolean);
  const subject = names.length === 1 ? names[0] + "'s" : "your pets'";
  return {
    summary: "I'm sorry, I couldn't finish answering that from " + subject + " history. You can check a few of the notes I found below, but they aren't a full answer.",
    sections: [{ heading: SAVED_NOTES_HEADING, items: [text] }],
  };
}
