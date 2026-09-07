const authoritativeMutationClaim = /\b(?:i(?:'ve| have|'ll| will)?|furvise has|we(?:'ve| have|'ll| will)?)\s+(?:save(?:d)?|delete(?:d)?|remove(?:d)?|forget|forgotten|change(?:d)?|update(?:d)?|archive(?:d)?|prepare(?:d)?|record(?:ed)?|complete(?:d)?|mark(?:ed)?)\b|\bi(?:'ll| will)\s+(?:treat|consider)\b[^.!?]{0,120}\bas\s+(?:removed|forgotten|changed|updated|deleted)\b/i;
const assistantOffer = /(?:^|[.!?]\s+)(?:if you want,?\s*)?(?:i can|i can also|would you like me to)\b[^.!?]*[.!?]?/gi;

const passiveMutationClaim = /\b(?:has been|was)\s+(saved|deleted|removed|forgotten|changed|updated|archived|prepared|recorded|completed|marked)\b/gi;
const physicalChangeSubject = /\b(?:food|diet|litter|litter tray|tray(?: location|position|setup)?)\s*$/i;
const physicalCourseSubject = /\b(?:medication|treatment|antibiotic)\s+course\s*$/i;
const applicationDestination = /\b(?:in|on|to|from)\s+(?:(?:the|your|her|his|their|its|pet['’]s)\s+)*(?:profile|history|record|entry|preference|settings|account|app|Furvise)\b|\bby\s+Furvise\b/i;

export function containsUnverifiedStateClaim(value: string) {
  if (authoritativeMutationClaim.test(value)) return true;
  for (const match of value.matchAll(passiveMutationClaim)) {
    const before = value.slice(0, match.index);
    const sentenceStart = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1;
    const subject = value.slice(sentenceStart, match.index);
    const clause = value.slice(sentenceStart).split(/[.!?\n]/, 1)[0];
    const dataSubject = /\b(?:profile|history|record|entry|preference|settings|account|app|Furvise)\b/i.test(subject);
    // A physical care event is not a claim that the application changed data.
    // This only classifies the speech act; source grounding is still required.
    const physical = match[1].toLowerCase() === "changed" && physicalChangeSubject.test(before)
      || match[1].toLowerCase() === "completed" && physicalCourseSubject.test(before);
    if (!physical || dataSubject || applicationDestination.test(clause)) return true;
  }
  return false;
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
  const clean = value.replace(assistantOffer, " ").replace(/[^\S\r\n]+/g, " ").trim();
  if (!clean) return "I can help with that.";
  if (verifiedSuccess || !containsUnverifiedStateClaim(clean)) return clean;
  const safe = clean.split(/(?<=[.!?])(?=\s)/).filter((sentence) => !containsUnverifiedStateClaim(sentence)).join("").trim();
  return safe || "I can help with that.";
}
