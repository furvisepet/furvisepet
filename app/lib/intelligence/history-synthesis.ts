import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";

export type HistorySynthesisProposal = { sourceId: string; text: string };

/** Controlled paraphrase equivalence, not open-ended entailment. Preserve the
 * ordered propositions and every modifier; only these reversible surface forms
 * share a representation. No bag-of-words matching, fuzzy similarity, omitted
 * clauses, causal inference or model-provided fact classifications are trusted. */
export function supportedHistoryParaphrase(source: string, proposed: string, petName: string): string | null {
  if (!proposed.trim() || proposed.length > 1800 || /[\r\n]/.test(proposed)) return null;
  const escaped = petName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subject = new RegExp(`^(?:${escaped}(?:['’]s)?|he|she|his|her)\\s+`, "iu");
  const numbers: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
  const quantities = (text: string) => [...text.matchAll(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*([\p{L}]+)/gu)]
    .map(match => `${numbers[match[1]] || match[1]} ${match[2]}`);
  if (JSON.stringify(quantities(source)) !== JSON.stringify(quantities(proposed))) return null;
  const canonical = (text: string) => splitSentencesPreservingFacts(text).map(sentence => sentence.trim()
    .replace(subject, "").replace(/^(The|A|An|Soft|Normal|No|Had|Experienced|Vomiting|Diarrhea|Itching|Sneezing)\b/, word => word.toLocaleLowerCase()).replace(/[.!]$/, "")
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, word => numbers[word])
    // These surface changes concern an observed symptom, not possession,
    // diagnosis, resolution, absence, causation or a lifelong state.
    .replace(/^(?:had|experienced)\s+(?=(?:soft stool|vomiting|diarrhea|itching|sneezing)\b)/, "")
    .replace(/^soft stools? (?:lasted|lasting|for) (\d+(?:\.\d+)? (?:days?|hours?|weeks?))\b/, "soft stool duration $1")
    .replace(/^normal stool\b/, "stool was normal")
    .replace(/^(.+?) was recorded as (.+?) by (.+)$/, "$3 recorded $1 as $2")
    .replace(/\s+/g, " ")).join("\n");
  if (canonical(source) !== canonical(proposed)) return null;
  // Supply visible subject identity independently, even for nameless records.
  return new RegExp(`^${escaped}(?:['’]s)?\\b`, "iu").test(proposed.trim())
    ? proposed.trim() : `${petName}: ${proposed.trim()}`;
}

/** Compare instants, including equivalent UTC offset/millisecond spellings
 * from correction payloads. Unknown dates retain a deterministic fallback. */
export function compareHistoryTime(left: string, right: string): number {
  const a = Date.parse(left); const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : left.localeCompare(right);
}

/** Order the existing evidence budget by requested selection, not a second
 * unrelated newest-N window. The tie-breaker is stable source identity. */
export function orderHistoryEvidence<T>(values: T[], selection: string | undefined, date: (value: T) => string, id: (value: T) => string, pet?: (value: T) => string, priority?: (value: T) => number): T[] {
  if (selection && pet) {
    const groups = [...new Set(values.map(pet))].sort().map(petId => orderHistoryEvidence(values.filter(value => pet(value) === petId), selection, date, id, undefined, priority));
    const fair: T[] = [];
    for (let index = 0; groups.some(group => index < group.length); index++) {
      for (const group of groups) if (index < group.length) fair.push(group[index]);
    }
    return fair;
  }
  // Relevance tiers always stay in priority order. Reversing chronology must
  // not reverse relevance, and endpoint balancing happens within each tier.
  if (priority) return [...new Set(values.map(priority))].sort((a,b)=>a-b)
    .flatMap(rank=>orderHistoryEvidence(values.filter(value=>priority(value)===rank),selection,date,id));
  const sorted = [...values].sort((a, b) => compareHistoryTime(date(a), date(b)) || id(a).localeCompare(id(b)));
  if (selection === "latest") return sorted.reverse();
  if (selection === "summary" || selection === "comparison") {
    // Under an upstream budget, retain both temporal boundaries before interior
    // details. Final composition puts those retained reports in date order.
    const balanced: T[] = [];
    let left = 0; let right = sorted.length - 1;
    while (left <= right) { balanced.push(sorted[left++]); if (left <= right) balanced.push(sorted[right--]); }
    return balanced;
  }
  return sorted;
}

export type OccurrenceReport = "affirmative" | "negative" | "unresolved";

/** Classification never ranks affirmative prose ahead of an older unknown.
 * Only a complete, explicit non-occurrence construction can be skipped. The
 * shared assertion analyzer supplies qualifiers; it is not medical entailment.
 * Unrecognized grammar, prevention, attribution and mixed polarity stay open. */
export function classifyOccurrenceReport(text: string, petName: string, terms: string[]): OccurrenceReport {
  const analysis = analyzeOwnerAssertions(text);
  if (!terms.length || !analysis.clauseSpans.length
    || analysis.clauseSpans.some(span => span.isQuestion || span.isUncertain || span.isConditional || span.isAttributed)
    || /["\u201c\u201d]|\b(?:will|would|should|reportedly|reported|according|said)\b/i.test(text)) return "unresolved";
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const topic = `(?:${terms.map(escape).join("|")})[a-z]*`;
  const subject = `(?:(?:${escape(petName)}|he|she)\\s+)?`;
  const negative = new RegExp(`^${subject}(?:(?:had|has|has had)\\s+)?no (?:more |further )?${topic}(?: (?:today|yesterday|on this day|this morning|this evening))?[.!]?$|^${subject}did not ${topic}(?: (?:today|yesterday|on this day|this morning|this evening))?[.!]?$`, "iu");
  if (negative.test(text.trim())) return "negative";
  if (analysis.clauseSpans.some(span => span.isNegated) || /\b(?:no|not|never|without)\b|n['\u2019]t\b/i.test(text)) return "unresolved";
  return analysis.hasOwnerAssertion ? "affirmative" : "unresolved";
}

/** Keep all reports at a potentially affirmative boundary, including negatives
 * that conflict at the same timestamp. Unknowns retain their chronological place. */
export function occurrenceCandidates<T>(values: T[], classify: (value: T) => OccurrenceReport, date: (value: T) => string): T[] {
  const dates = new Set(values.filter(value => classify(value) !== "negative").map(value => Date.parse(date(value))));
  return dates.size ? values.filter(value => dates.has(Date.parse(date(value)))) : values;
}
