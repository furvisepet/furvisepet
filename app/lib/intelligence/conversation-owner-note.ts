import { analyzeOwnerAssertions, ownerDeclinesPersistence, unquotedOwnerText } from "../ai/owner-assertion.ts";
import { explicitNoteTime, type OwnerNoteRequest } from "./owner-note-request.ts";

type Subject = { id: string; name: string | null };
export type OwnerNoteSource = { id: string; request_id: string; user_text: string; created_at: string };
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A reference-only command authorizes the existing owner words, not an AI
 * draft. Additional tasks, edits, conditions and inferred details stay outside
 * this fast path. No medication name or dose is required for a raw note. */
export function isConversationNoteSave(message: string): boolean {
  const text = unquotedOwnerText(message).trim();
  if (ownerDeclinesPersistence(message)) return false;
  return /^(?:(?:ok(?:ay)?|yes|yeah|yep|sure|bro|idk|please|just|so|then|now|already)[,\s]+)*(?:(?:can|could|would)\s+(?:you|u)\s+)?(?:save|log|record|add)\s+(?:(?:it|this|that|the\s+note|that\s+note|this\s+note)\s*)?(?:(?:to|in|into)\s+(?:(?:my|his|her|the|care)\s+)*(?:notes?|history|care\s+history)\s*)?(?:please|already|now)?[.!?]*$/i.test(text);
}

/** Inputs must be prior USER messages from the same owned pet conversation,
 * newest first. Stop on a topic change, opt-out or another named pet. */
export function resolveConversationOwnerNote(input: {
  message: string; sources: OwnerNoteSource[]; pet: Subject; pets: Subject[]; timeZone?: string;
}): { source: OwnerNoteSource; note: OwnerNoteRequest } | null {
  if (!isConversationNoteSave(input.message)) return null;
  const referencedDrafts: string[] = [];
  for (const source of input.sources) {
    const text = source.user_text.trim();
    if (!text || !source.request_id) return null;
    if (ownerDeclinesPersistence(text)) return null;
    const named = input.pets.filter(p => p.name && new RegExp(`(?<![\\p{L}])${escape(p.name)}(?![\\p{L}])`, "iu").test(unquotedOwnerText(text)));
    if (named.some(p => p.id !== input.pet.id)) return null;
    if (isConversationNoteSave(text)) continue;
    const draftReference = /^(?:(?:ok(?:ay)?|yes|yeah|please|just|so)[,\s]+)*save\s+something\s+like\s+(.+)$/i.exec(text);
    if (draftReference) { referencedDrafts.push(draftReference[1]); continue; }
    if (input.pet.name && new RegExp(`^(?:(?:yes|yeah|it['’]s|i mean)\\s+)?${escape(input.pet.name)}[.!]*$`, "iu").test(text)) continue;
    if (/^(?:ok(?:ay)?|yes|yeah|yep|sure|thanks|thank you)(?:[,\s]+(?:please|do (?:the |a )?simple one))?[.!]*$/i.test(text)) continue;
    const analysis = analyzeOwnerAssertions(text);
    if (!analysis.hasOwnerAssertion || analysis.hasExplicitCorrection || analysis.isPureQuestion
      || /\?|\b(?:save|log|record|draft|translate|example|hypothetical|pretend|suppose|instead|delete|replace)\b/i.test(unquotedOwnerText(text))) return null;
    // A requested shorthand may refer back to the same observation, but cannot
    // introduce a dose, medication, date or other fact absent from owner text.
    const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
    if (referencedDrafts.some(draft => (draft.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).some(word => !words.has(word)))) return null;
    // Keep the original source and request identity. The database verifies its
    // exact text, owner and pet and deduplicates repeated save commands by source.
    return { source, note: { note: source.user_text, ...explicitNoteTime(source.user_text, input.timeZone), needsAnswer: false } };
  }
  return null;
}
