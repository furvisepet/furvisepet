/** Lexical airway triage only; never ownership, diagnosis or mutation authority.
 * Callers retain the shared quote, conditional and patient scope boundaries. */
export const acuteAirwayPattern = /\b(?:choking|(?:airway|windpipe)(?:\s+(?:is|are|seems?|appears?)(?:\s+to be)?)?\s+(?:blocked|obstructed)|(?:blocked|obstructed)\s+(?:airway|windpipe)|(?:acute\s+)?(?:airway|windpipe)\s+obstruction)\b/i;

const currentMarker = /\b(?:now|currently|still|again|ongoing)\b/i;
const pastContext = /\b(?:yesterday|last (?:night|week|month|year)|(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?) ago|history of|previous (?:episode|incident))\b/i;
const educational = /^(?:what (?:is|are|causes?) (?:acute )?(?:choking|(?:an? )?(?:airway|windpipe) obstruction)|(?:tell me about|definition of|how (?:to|can (?:i|we)) (?:prevent|avoid))\b)/i;
const negatedPrefix = /(?:\b(?:not|never|no(?:\s+(?:signs?|evidence|indication)\s+of)?|without)|n['’]t)(?:\s+(?:actually|currently|actively|still|have|having|any|an?|signs?|of))*\s*$/i;

export function currentAcuteAirwayMatch(text: string): RegExpExecArray | null {
  if (educational.test(text.trim())) return null;
  if (pastContext.test(text) && !currentMarker.test(text)) return null;
  const matches = new RegExp(acuteAirwayPattern.source, "gi");
  for (let match = matches.exec(text); match; match = matches.exec(text)) {
    const before = text.slice(0, match.index);
    // A past progressive report alone does not establish ongoing obstruction.
    if (!currentMarker.test(text) && /\b(?:was|were|had been)\s+(?:(?:actively|actually)\s+)?$/i.test(before)) continue;
    if (negatedPrefix.test(before)) continue;
    return match;
  }
  return null;
}

export function acuteAirwayResolution(text: string): RegExpExecArray | null {
  return /\b(?:breathing (?:normally|is normal)|can breathe normally|no longer choking|not choking|choking (?:has )?(?:stopped|resolved)|(?:has )?stopped choking|(?:airway|windpipe)(?:\s+is)?\s+(?:clear|unblocked)|fully recovered)\b/i.exec(text);
}
