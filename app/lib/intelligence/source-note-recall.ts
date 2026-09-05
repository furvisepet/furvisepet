import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { FurviseLiveContext } from "./types.ts";

export type SourceNoteRecall = {
  intent: "source" | "effective";
  petId: string | null;
  dateLabel: string | null;
  candidateIds: string[];
  competingIds: string[];
  topicStatus?: "supported" | "unsupported_or_ambiguous";
};

/** Literal named-test matching, not a clinical synonym resolver. Generic
 * descriptors cannot establish which test was requested. Unsupported compound
 * descriptions require clarification rather than falling back to test/result. */
function requestedTopicMatcher(question: string, dateEnd: number): RegExp | null {
  if (/\btests?\b/i.test(question)) {
    // Recognize the complete descriptor after the explicit date, not merely
    // the last word before 'test' (e.g. liver function vs kidney function).
    // Other grammatical arrangements are unsupported, not generic matches.
    const named = /^\s*(?:the\s+)?([a-z]+(?:[ -][a-z]+)*)[ -]tests?\b/i.exec(question.slice(dateEnd));
    if (!named || /\b(?:and|or)\b/i.test(named[1])) return null;
    const generic = /^(?:a|an|the|this|that|which|what|her|his|their|my|our|some|any|other|another|first|second|third|last|latest|previous|recent|new|old|lab|laboratory|medical|diagnostic|screening|function|vet|veterinary)$/;
    const topic = named[1].toLowerCase();
    if (generic.test(topic)) return null;
    // Preserve every named component of hyphenated tests; never reduce a named
    // blood test to a match on 'test', 'result', 'vet', or 'diagnosis'.
    return new RegExp(`\\b(?:${topic.replace(/[- ]/g, "[- ]")}[- ]+(?:tests?|results?)${topic === "urine" ? "|urinalysis" : ""})\\b`, "i");
  }
  return /\bdiagnos\w*\b/i.test(question) ? /\bdiagnos\w*\b/i : null;
}

// A bounded locator, not event-time inference. Missing years are not defaulted
// to this year: all matching loaded years participate in ambiguity checks.
function requestedDate(text: string) {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const matches = [...text.matchAll(/\b(?:(\d{4})-(\d{2})-(\d{2})|(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?)\b/gi)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const year = match[1] || match[6] || null;
  const month = match[2] || String(months.indexOf(match[4].slice(0, 3).toLowerCase()) + 1).padStart(2, "0");
  const day = (match[3] || match[5]).padStart(2, "0");
  const check = `${year || "2000"}-${month}-${day}`;
  if (!Number.isFinite(Date.parse(check)) || new Date(check).toISOString().slice(0, 10) !== check) return null;
  return { year, month, day, label: match[0], end: match.index! + match[0].length };
}

/** Index already-loaded candidates before existing selection. No retrieval,
 * ranking, inferred test results, or model-proposed record IDs are used. */
export function buildSourceNoteRecall(context: FurviseLiveContext, contract: AskEvidenceContract): SourceNoteRecall | undefined {
  if (contract.scope.requestKind !== "record_lookup") return undefined;
  const question = contract.scope.requestText;
  const sourceIntent = /\b(?:say|said|says|show|showed|state|stated|mention|mentioned|recorded|documented|written|note|report)\b/i.test(question)
    && !/\b(?:current|currently|now|latest|still|today)\b/i.test(question);
  const date = requestedDate(question);
  const petId = contract.scope.authorizedPetIds.length === 1 ? contract.scope.authorizedPetIds[0] : null;
  const plan: SourceNoteRecall = { intent: sourceIntent ? "source" : "effective", petId, dateLabel: date?.label || null, candidateIds: [], competingIds: [] };
  if (!sourceIntent || !date || !petId) return plan;
  const topic = requestedTopicMatcher(question, date.end);
  plan.topicStatus = topic ? "supported" : "unsupported_or_ambiguous";
  if (!topic) return plan;
  const related = context.careEntries.filter(row => row.pet_profile_id === petId && row.user_id === context.owner.userId
    && topic.test(`${row.title || ""} ${row.note}`));
  const candidates = related.filter(row => {
    const eventDate = row.occurred_at?.slice(0, 10);
    return eventDate && eventDate.slice(5) === `${date.month}-${date.day}` && (!date.year || eventDate.startsWith(`${date.year}-`));
  });
  plan.candidateIds = candidates.map(row => `care:${row.id}`);
  if (candidates.length === 1) {
    const target = candidates[0];
    // Do not pretend to solve contradiction semantics. Later/undated related
    // evidence or an explicit correction needs reconciliation, even if omitted
    // by model selection. Earlier unrelated-in-time results do not block quotes.
    plan.competingIds = related.filter(row => row.id !== target.id && (!row.occurred_at || row.occurred_at >= target.occurred_at!
      || /\b(?:correct\w*|supersed\w*|retract\w*)\b/i.test(`${row.title || ""} ${row.note}`))).map(row => `care:${row.id}`);
  }
  return plan;
}

export function sourceNoteAnswer(contract: AskEvidenceContract): { text: string; sourceIds: string[] } {
  const plan = contract.sourceNoteRecall;
  const limited = (text: string) => ({ text, sourceIds: [] });
  if (!plan || plan.intent === "effective") return limited("I can't establish the current or effective result or diagnosis from this evidence. A historical note alone does not establish current medical status.");
  if (!plan.petId || !plan.dateLabel) return limited("Please identify the pet and date of the note. I can't uniquely identify the requested record from this question.");
  if (plan.topicStatus === "unsupported_or_ambiguous") return limited("I can't establish which named test or topic matches the requested note. Please identify the specific test; generic test or vet wording is not enough.");
  const source = contract.sources.find(source => source.petId === plan.petId && source.source === "care_entries");
  if (!source || source.status === "unavailable" || source.status === "not_loaded") return limited("The requested note's source is unavailable. I can't establish what that note said.");
  if (plan.candidateIds.length > 1) return limited("Multiple matching notes are available. Please identify the year or specific note before I quote its contents.");
  if (plan.competingIds.length) return limited("Other related records may conflict with or update that note. I can't reconcile them from this evidence; please identify the record to review.");
  const id = plan.candidateIds[0];
  const spans = contract.represented.filter(span => span.sourceId === id && span.petId === plan.petId && span.sourceType === "care_update");
  const span = spans[0];
  if (spans.length !== 1 || !span || !source.loadedIds.includes(id) || contract.losses.some(loss => loss.sourceId === id)
    || span.start !== 0 || span.end !== span.text.length || !span.text.trim() || span.text.length > 1000) {
    return limited("The requested note is not fully represented in the available evidence. I can't establish what it said; this does not mean the record or result is absent.");
  }
  return { text: `The ${plan.dateLabel} note says: “${span.text}” This reports that note's contents, not a verified current medical status.`, sourceIds: [id] };
}
