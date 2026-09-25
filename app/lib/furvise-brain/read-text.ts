import type { ReadPredicate } from "./read-ticket.ts";

/** Literal normalized token sequences with conservative regular inflection
 * equivalence. This preserves token boundaries while allowing ordinary surface
 * forms to refer to the same lexical token. It deliberately does not use
 * arbitrary substring matching. */
export const normalizeReadText = (text: string) =>
 text.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function tokenForms(token: string) {
 const forms = new Set([token]);
 if (token.length >= 5 && token.endsWith("s")) forms.add(token.slice(0, -1));
 if (token.length >= 6 && token.endsWith("es")) forms.add(token.slice(0, -2));
 if (token.length >= 6 && token.endsWith("ed")) {
  forms.add(token.slice(0, -2));
  forms.add(token.slice(0, -1));
 }
 if (token.length >= 7 && token.endsWith("ing")) {
  const base = token.slice(0, -3);
  forms.add(base);
  if (base.length >= 2 && base.at(-1) === base.at(-2)) forms.add(base.slice(0, -1));
 }
 return forms;
}
function tokenEquivalent(a: string, b: string) {
 if (a === b) return true;
 const left = tokenForms(a), right = tokenForms(b);
 for (const form of left) if (right.has(form)) return true;
 return false;
}
function termMatchesTokens(tokens: string[], term: string) {
 const normalized = normalizeReadText(term);
 if (!normalized) return false;
 const wanted = normalized.split(" ");
 if (wanted.length > tokens.length) return false;
 for (let start = 0; start <= tokens.length - wanted.length; start++) {
  if (wanted.every((token, index) => tokenEquivalent(token, tokens[start + index]))) return true;
 }
 return false;
}
export function textMatchesReadPredicate(text: string, predicate: ReadPredicate): boolean {
 const haystack = normalizeReadText(text);
 const tokens = haystack ? haystack.split(" ") : [];
 return predicate.terms.some(term => termMatchesTokens(tokens, term));
}
