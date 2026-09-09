/** Search hints select candidates only; they never establish facts or grant scope. */
const uninformative = new Set("about after again before between compare comparison date dates earlier empty earliest first from give history latest later last main note notes observation observations owned pet pets please record recorded records saved show than that their then these this through using what when which with would could does did have has had current currently back because".split(" "));
function words(value: string) { return value.toLowerCase().match(/[a-z]{3,}/g) || []; }
const stem = (word: string) => word.length > 5 ? word.slice(0, 5) : word.replace(/s$/, "");
export function historyQueryTerms(terms: string[], petNames: string[] = []): string[] {
  const names = new Set(petNames.flatMap(words));
  return [...new Set(terms.flatMap(words).filter(word => !uninformative.has(word) && !names.has(word)).map(stem))]
    .sort((a,b) => b.length-a.length || a.localeCompare(b)).slice(0,6);
}
export function historyQueryRelevance(text: string, terms: string[]): number {
  const tokens = new Set(words(text).map(stem));
  return terms.reduce((score,term) => score+(tokens.has(term)?1:0),0);
}
/** Event verbs are a separate retrieval facet. Mixing them into one OR search
 * with a frequent topic lets routine observations starve the decisive event.
 * These aliases cover changes across care domains, not particular pets/dates. */
const eventFacets: Array<[RegExp, string[]]> = [
  [/\b(?:switch\w*|chang(?:e|ed|ing)|transition\w*)\b/i, ["switc", "chang", "trans"]],
  [/\b(?:stop\w*|discontinu\w*|ceas\w*)\b/i, ["stop", "disco", "cease"]],
  [/\b(?:start\w*|began|begin\w*)\b/i, ["start", "began", "begin"]],
  [/\b(?:increas\w*|rais\w*)\b/i, ["incre", "raise"]],
  [/\b(?:decreas\w*|reduc\w*|lower\w*)\b/i, ["decre", "reduc", "lower"]],
];
export function historyEventTerms(message: string): string[] {
  return [...new Set(eventFacets.filter(([pattern]) => pattern.test(message)).flatMap(([,terms]) => terms))].slice(0,6);
}
/** Preserve rare event facets through evidence budgets. Frequency is measured
 * only inside the already authorized candidate subset, never as factual proof.
 * Repeated "reason for any change unknown" must not outrank a rare transition.
 * Prefix matching mirrors the lexical search, including stopped/discontinued. */
export function historyEventRelevance(documents: string[], terms: string[]): (text: string) => number {
  const matches = (text: string, term: string) => words(text).some(word => word.startsWith(term));
  const frequencies = new Map(terms.map(term => [term, documents.filter(text => matches(text, term)).length]));
  return text => Math.max(0, ...terms.map(term =>
    matches(text, term) ? documents.length / Math.max(1, frequencies.get(term) || 0) : 0));
}
export function historySearchGroups(terms: string[], message: string): string[][] {
  const events = historyEventTerms(message);
  if (!events.length) return Array.from({length: Math.min(3,terms.length)}, (_,i) => terms.filter((_,n) => n%Math.min(3,terms.length)===i));
  // A frequent alias (for example change in routine measurement caveats) must
  // not starve a rarer equivalent. Keep each alias in its own bounded search.
  return events.slice(0,3).map(term => [term]);
}
