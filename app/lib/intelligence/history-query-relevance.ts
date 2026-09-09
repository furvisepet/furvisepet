/** Bounded lexical hints, never evidence or semantic completeness. Normalize
 * phrase spelling before the RPC and rank the returned whole records separately. */
const uninformative = new Set("about after again before between compare comparison date dates earlier empty first from give history latest later last main note notes observation observations owned pet pets please record recorded records saved show than that their then these this through using what when which with would".split(" "));
function words(value: string) { return value.toLowerCase().match(/[a-z]{3,}/g) || []; }
const stem = (word: string) => word.length > 5 ? word.slice(0, 5) : word.replace(/s$/, "");
export function historyQueryTerms(terms: string[], petNames: string[] = []): string[] {
  const names = new Set(petNames.flatMap(words));
  return [...new Set(terms.flatMap(words).filter(word=>!uninformative.has(word)&&!names.has(word)).map(stem))]
    .sort((a,b)=>b.length-a.length || a.localeCompare(b)).slice(0,6);
}
export function historyQueryRelevance(text: string, terms: string[]): number {
  const tokens = new Set(words(text).map(stem));
  return terms.reduce((score,term)=>score+(tokens.has(term)?1:0),0);
}
