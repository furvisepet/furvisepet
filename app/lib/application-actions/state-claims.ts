import { mapAskProse, askProseOnly } from "../furvise-output.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
const authoritativeMutationClaim = /\b(?:i(?:'ve| have|'ll| will)?|furvise has|we(?:'ve| have|'ll| will)?)\s+(?:save(?:d)?|delete(?:d)?|remove(?:d)?|forget|forgotten|change(?:d)?|update(?:d)?|archive(?:d)?|prepare(?:d)?|record(?:ed)?|complete(?:d)?|mark(?:ed)?)\b|\bi(?:'ll| will)\s+(?:treat|consider)\b[^.!?]{0,120}\bas\s+(?:removed|forgotten|changed|updated|deleted)\b/i;
const assistantOffer = /(?:^|[.!?]\s+)(?:(?:if you want,?\s*)(?:i can(?: also)?|would you like me to)\s+|would you like me to\s+|i can(?: also)?\s+(?:help|assist|save|update|delete|prepare)\b)[^.!?]*[.!?]?/gi;

const passiveMutationClaim = /\b(?:has been|was)\s+(?:(?:just|now|successfully)\s+)?(saved|deleted|removed|forgotten|changed|updated|archived|prepared|recorded|completed|marked)\b/gi;
const physicalChangeSubject = /\b(?:food|diet|litter|litter tray|tray(?: location|position|setup)?)\s*$/i;
const physicalCourseSubject = /\b(?:medication|treatment|antibiotic)\s+course\s*$/i;
const applicationDestination = /\b(?:in|on|to|from)\s+(?:(?:the|your|her|his|their|its|pet['’]s)\s+)*(?:profile|history|record|entry|preference|settings|account|app|Furvise)\b|\bby\s+Furvise\b/i;

export function containsUnverifiedStateClaim(value: string) {
  let contains = false;
  preserveFictionalDialogueQuotes(value, prose => {
    contains = containsUnquotedStateClaim(prose);
    return prose;
  });
  return contains;
}

function containsUnquotedStateClaim(value: string) {
  value = askProseOnly(value);
  if (containsNavigationExecutionClaim(value)) return true;
  // A relative clause describing a retrieved measurement is not a receipt.
  // Keep affirmative app writes elsewhere in the same text subject to checks.
  const speech = value.replace(/\b((?:(?:earliest|latest|first|last|oldest|newest|saved|recorded)\s+)*(?:weight|measurement|temperature|dose|duration|distance|reading))\s+(?:that\s+)?I\s+(?:have\s+)?(?:saved|recorded)\s+(?:for\s+[^.!?;]{1,60}?\s+)?(?=is\b|was\b)/gi, "$1 ");
  if (authoritativeMutationClaim.test(speech)
    || /\b(?:i['’]m|i am|we['’]re|we are)\s+(?:now\s+)?(?:saving|recording|updating|deleting|archiving|sending|adding)\b[^.!?]{0,120}\b(?:history|log|profile|record|entry|preference|settings)\b/i.test(speech)) return true;
  for (const clause of splitSentencesPreservingFacts(value)) for (const match of clause.matchAll(passiveMutationClaim)) {
    const before = clause.slice(0, match.index);
    // Negated speech is not a receipt; a later affirmative clause still is.
    if (isNegatedReceiptSpeech(before)) continue;
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

function isNegatedReceiptSpeech(before: string) {
  const clause = before.split(/[,;.!?]|\b(?:but|however|and|yet)\b/i).at(-1) || "";
  return /\b(?:cannot|can['’]t|could not|couldn['’]t|will not|won['’]t)\s+(?:honestly\s+|truthfully\s+)?(?:say|claim|confirm|pretend)\s+(?:that\s+)?(?:[\w'’]+\s+){0,5}$/i.test(clause);
}

/** A navigation proposal supplies a link, not a browser-execution receipt.
 * Even a successful database mutation cannot certify that a page was opened. */
export function containsNavigationExecutionClaim(value: string) {
  const destination = "(?:profile|page|history|memories|vet brief)";
  const patterns = [
    new RegExp(`\\b(?:i(?:['’]ve| have)?|we(?:['’]ve| have)?|furvise has)\\s+(?:taken|brought|sent|redirected)\\s+you\\s+to\\s+[^.!?\\n]{0,80}\\b${destination}\\b`, "gi"),
    new RegExp(`\\b(?:i['’]m|i am|we['’]re|we are|furvise is)\\s+(?:now\\s+)?(?:opening|navigating to)\\s+[^.!?\\n]{0,80}\\b${destination}\\b`, "gi"),
    // A standalone progress announcement implies execution too. Keep gerund
    // explanations ("Opening a profile lets you...") and instructions intact.
    new RegExp(`(?:^|[.!?\\n]\\s*)(?:[-*]\\s*)?(?:opening|navigating to)\\s+[^.!?\\n]{0,80}\\b${destination}(?:\\s+(?:for|using|with|from)\\b[^.!?\\n]{0,100})?\\s*(?:now\\s*)?(?=[.!?\\n]|$)`, "gi"),
    new RegExp(`\\b(?:i(?:['’]ve| have)?|we(?:['’]ve| have)?|furvise has)\\s+(?:opened|navigated to)\\s+[^.!?\\n]{0,80}\\b${destination}\\b`, "gi"),
    new RegExp(`\\b${destination}\\s+(?:is|was|has been)\\s+(?:(?:now|already|successfully)\\s+)?open(?:ed)?\\b`, "gi"),
  ];
  return patterns.some(pattern => [...value.matchAll(pattern)].some(match => !isNegatedReceiptSpeech(value.slice(0, match.index))));
}
export function containsUntrustedTerminalMutationClaim(value: string) {
  const pattern = /\b(?:profile|history|record|entry|preference|concern|pet|update|change)\s+(?:is\s+|has\s+been\s+|was\s+)?(saved|deleted|removed|forgotten|changed|updated|archived|recorded|completed|marked)\b/gi;
  for (const match of value.matchAll(pattern)) {
    if (isNegatedReceiptSpeech(value.slice(0, match.index))) continue;
    if (match[1].toLowerCase() === "recorded" && isHistoricalRecordingAttribution(value)) continue;
    return true;
  }
  return false;
}
export function isHistoricalRecordingAttribution(value: string) {
  return !authoritativeMutationClaim.test(value) && !applicationDestination.test(value)
    && !/\b(?:profile|history|record|entry|preference|settings|account|app|Furvise)\b/i.test(value.split(/\b(?:was|has been)\s+recorded\b/i)[0])
    && /\b(?:was|has been)\s+recorded\b/i.test(value)
    // Passive reporting without an app actor/destination describes evidence.
    // Dating is an evidence-review concern, not proof of application authority.
    && !/\b(?:just|now|successfully)\s+(?:been\s+)?recorded\b|\brecorded\s+(?:now|successfully)\b/i.test(value);
}

export function enforceVerifiedStateClaims(value: string, verifiedSuccess: boolean) {
  return mapAskProse(value, prose => preserveFictionalDialogueQuotes(prose,
    text => preserveAttributedReportQuotes(text, unquoted => enforceUnquotedStateClaims(unquoted, verifiedSuccess))));
}

/** Literary dialogue is a character's speech, not an application receipt.
 * Protect only balanced quotes with explicit literary attribution in the same
 * sentence. The surrounding assistant claims always remain subject to checks. */
export function preserveFictionalDialogueQuotes(value: string, transform: (prose: string) => string): string {
  let marker = "FURVISEFICTIONALDIALOGUE";
  while (value.includes(marker)) marker += "X";
  const quotes: string[] = [];
  const prose = value.replace(/"(?:\\.|[^"\\\n])*"|“[^”\n]*”|(?<!\w)'[^'\n]+'(?!\w)|‘[^’\n]*’/g, (quote, offset: number) => {
    const before = value.slice(0, offset).split(/[.!?\n]/).at(-1) || "";
    const after = value.slice(offset + quote.length).split(/[.!?\n]/)[0];
    const attribution = before + " QUOTE " + after;
    if (!/\b(?:fictional\s+(?:dialogue|character|quote|quotation)|(?:dialogue|line|quote|quotation)\s+(?:in|from)\s+(?:a|the)\s+(?:novel|story|script)|(?:novel|story|script)['’]s\s+(?:character|narrator))\b/i.test(attribution)) return quote;
    return marker + (quotes.push(quote) - 1) + "END" + (/[.!?]["'”’]$/.test(quote) ? "." : "");
  });
  let result = transform(prose);
  quotes.forEach((quote, index) => {
    const token = marker + index + "END";
    if (/[.!?]["'”’]$/.test(quote)) result = result.replaceAll(token + ".", quote);
    result = result.replaceAll(token, quote);
  });
  return result;
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

/** Optional offers are presentation copy, not the answer's factual body.
 * Apply this before approval as well as reload, using exactly one policy. */
export function stripOptionalAssistantOffers(value: string) {
  return mapAskProse(value, prose => preserveFictionalDialogueQuotes(prose, text =>
    preserveAttributedReportQuotes(text, unquoted => unquoted.replace(assistantOffer,
      offer => /\b(?:but|however|cannot|unable)\b|can[’'\x27]t|won[’'\x27]t/i.test(offer) ? offer : " ")
      .replace(/[^\S\r\n]+/g, " ").trim())));
}

function enforceUnquotedStateClaims(value: string, verifiedSuccess: boolean) {
  const clean = stripOptionalAssistantOffers(value).trim();
  if (!clean) return "I can help with that.";
  const unsupported = (sentence: string) => containsNavigationExecutionClaim(sentence)
    || !verifiedSuccess && containsUnverifiedStateClaim(sentence);
  if (!unsupported(clean)) return clean;
  const safe = splitSentencesPreservingFacts(clean).filter((sentence) => !unsupported(sentence)).join(" ").trim();
  return safe || "I can help with that.";
}

/** Remove only unsupported navigation execution clauses before review. The
 * prepared card supplies the link; the remaining answer still needs review. */
export function removeNavigationExecutionClaims(value: string): string {
  return mapAskProse(value, prose => preserveFictionalDialogueQuotes(prose, text =>
    splitSentencesPreservingFacts(text).filter(sentence => !containsNavigationExecutionClaim(sentence)).join(" ").trim()));
}
