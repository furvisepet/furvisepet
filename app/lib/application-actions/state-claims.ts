const authoritativeMutationClaim = /\b(?:i(?:'ve| have|'ll| will)?|furvise has|we(?:'ve| have|'ll| will)?)\s+(?:save(?:d)?|delete(?:d)?|remove(?:d)?|forget|forgotten|change(?:d)?|update(?:d)?|archive(?:d)?|prepare(?:d)?|record(?:ed)?|complete(?:d)?|mark(?:ed)?)\b|\bi(?:'ll| will)\s+(?:treat|consider)\b[^.!?]{0,120}\bas\s+(?:removed|forgotten|changed|updated|deleted)\b|\b(?:has been|was)\s+(?:saved|deleted|removed|forgotten|changed|updated|archived|prepared|recorded|completed|marked)\b/i;
const assistantOffer = /(?:^|[.!?]\s+)(?:if you want,?\s*)?(?:i can|i can also|would you like me to)\b[^.!?]*[.!?]?/gi;

export function containsUnverifiedStateClaim(value: string) {
  return authoritativeMutationClaim.test(value);
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
  quotes.forEach((quote, index) => { result = result.replaceAll(marker + index + "END.", quote); });
  return result;
}

function enforceUnquotedStateClaims(value: string, verifiedSuccess: boolean) {
  const clean = value.replace(assistantOffer, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "I can help with that.";
  if (verifiedSuccess || !containsUnverifiedStateClaim(clean)) return clean;
  const safe = clean.split(/(?<=[.!?])\s+/).filter((sentence) => !containsUnverifiedStateClaim(sentence)).join(" ").trim();
  return safe || "I can help with that.";
}
