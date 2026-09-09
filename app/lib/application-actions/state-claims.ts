import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
const authoritativeMutationClaim = /\b(?:i(?:'ve| have|'ll| will)?|furvise has|we(?:'ve| have|'ll| will)?)\s+(?:save(?:d)?|delete(?:d)?|remove(?:d)?|forget|forgotten|change(?:d)?|update(?:d)?|archive(?:d)?|prepare(?:d)?|record(?:ed)?|complete(?:d)?|mark(?:ed)?)\b|\bi(?:'ll| will)\s+(?:treat|consider)\b[^.!?]{0,120}\bas\s+(?:removed|forgotten|changed|updated|deleted)\b/i;
const assistantOffer = /(?:^|[.!?]\s+)(?:(?:if you want,?\s*)(?:i can(?: also)?|would you like me to)\s+|would you like me to\s+|i can(?: also)?\s+(?:help|assist|save|update|delete|prepare)\b)[^.!?]*[.!?]?/gi;

const passiveMutationClaim = /\b(?:has been|was)\s+(?:(?:just|now|successfully)\s+)?(saved|deleted|removed|forgotten|changed|updated|archived|prepared|recorded|completed|marked)\b/gi;
const physicalChangeSubject = /\b(?:food|diet|litter|litter tray|tray(?: location|position|setup)?)\s*$/i;
const physicalCourseSubject = /\b(?:medication|treatment|antibiotic)\s+course\s*$/i;
const applicationDestination = /\b(?:in|on|to|from)\s+(?:(?:the|your|her|his|their|its|pet['’]s)\s+)*(?:profile|history|record|entry|preference|settings|account|app|Furvise)\b|\bby\s+Furvise\b/i;

export function containsUnverifiedStateClaim(value: string) {
  if (authoritativeMutationClaim.test(value)) return true;
  for (const clause of splitSentencesPreservingFacts(value)) for (const match of clause.matchAll(passiveMutationClaim)) {
    const before = clause.slice(0, match.index);
    // Attribution prefixes are not the subject of the embedded statement.
    const subject = before.split(/\b(?:says|said|reports|states|documents)\b/i).at(-1) || before;
    const dataSubject = /\b(?:profile|history|record|entry|preference|settings|account|app|Furvise)\b/i.test(subject);
    // Absence in a clinical note does not announce a successful app write.
    const absentClinicalDetail = /\bno\s+(?:[a-z-]+\s+){0,10}$/i.test(subject)
      && !dataSubject
      && !/\bby\s+Furvise\b/i.test(clause);
    if (absentClinicalDetail) continue;
    const after = clause.slice(match.index! + match[0].length);
    // Dated attribution describes an existing observation, not a new app write.
    if (match[1].toLowerCase() === "recorded" && isHistoricalRecordingAttribution(clause)) continue;
    const dietTransition = match[1].toLowerCase() === "changed"
      && /^\s+(?:from\s+[^.!?,;]{1,100}\s+to\s+|to\s+)[^.!?,;]{0,100}\b(?:food|diet|kibble)\b/i.test(after);
    // A physical care event is not a claim that the application changed data.
    // This only classifies the speech act; source grounding is still required.
    const datedCompletion = match[1].toLowerCase() === "completed"
      && /\b(?:on|in)\s+(?:\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2})\b/i.test(after)
      && !/\b(?:save|deletion|update|request|task|action|operation|setup|data|note)\b/i.test(subject)
      && !/^\s*(?:it|this|that|the task)\s*$/i.test(subject);
    const physical = datedCompletion || dietTransition || match[1].toLowerCase() === "changed" && physicalChangeSubject.test(before)
      || match[1].toLowerCase() === "completed" && physicalCourseSubject.test(before);
    if (!physical || dataSubject || applicationDestination.test(clause)) return true;
  }
  return false;
}

export function isHistoricalRecordingAttribution(value: string) {
  return !authoritativeMutationClaim.test(value) && !applicationDestination.test(value)
    && !/\b(?:profile|history|record|entry|preference|settings|account|app|Furvise)\b/i.test(value)
    && /\b(?:was|has been)\s+recorded\b/i.test(value)
    // Passive reporting without an app actor/destination describes evidence.
    // Dating is an evidence-review concern, not proof of application authority.
    && !/\b(?:just|now|successfully)\s+(?:been\s+)?recorded\b|\brecorded\s+(?:now|successfully)\b/i.test(value);
}

export function enforceVerifiedStateClaims(value: string, verifiedSuccess: boolean) {
  return preserveAttributedReportQuotes(value, prose => enforceUnquotedStateClaims(prose, verifiedSuccess));
}

/** A dated quotation is source content, never an action receipt. Keep it opaque
 * while checking surrounding assistant prose; do not splice quoted sentences. */
export function preserveAttributedReportQuotes(value: string, transform: (prose: string) => string): string {
  let marker = "FURVISEQUOTEDREPORT";
  while (value.includes(marker)) marker += "X";
  const quotes: string[] = [];
  const prose = value.replace(/\b(\d{4}-\d{2}-\d{2}(?: report| says):\s*)("(?:\\.|[^"\\])*")/g, (_match, prefix, quote) => {
    const index = quotes.push(quote) - 1;
    return prefix + marker + index + "END.";
  });
  let result = transform(prose);
  quotes.forEach((quote, index) => {
    const token = marker + index + "END";
    // Offer filtering can consume the preceding sentence delimiter. Restore
    // either form, so protected source text never becomes a visible marker.
    result = result.replaceAll(token + ".", quote).replaceAll(token, quote);
  });
  return result;
}

function enforceUnquotedStateClaims(value: string, verifiedSuccess: boolean) {
  const clean = value.replace(assistantOffer, (offer) => /\b(?:but|however|cannot|unable)\b|can[’'\x27]t|won[’'\x27]t/i.test(offer) ? offer : " ").replace(/[^\S\r\n]+/g, " ").trim();
  if (!clean) return "I can help with that.";
  if (verifiedSuccess || !containsUnverifiedStateClaim(clean)) return clean;
  const safe = clean.split(/(?<=[.!?])(?=\s)/).filter((sentence) => !containsUnverifiedStateClaim(sentence)).join("").trim();
  return safe || "I can help with that.";
}
