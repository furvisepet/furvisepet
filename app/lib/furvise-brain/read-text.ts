import type { ReadPredicate } from "./read-ticket.ts";

/** Literal normalized token sequences: OR within a predicate, AND at the caller.
 * Empty normalized terms preserve the effective-stream matcher's literal behavior;
 * callers that historically reject empty terms still reject them before matching. */
export const normalizeReadText = (text: string) =>
 text.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function textMatchesReadPredicate(text: string, predicate: ReadPredicate): boolean {
 const haystack = " " + normalizeReadText(text) + " ";
 return predicate.terms.some(term => haystack.includes(" " + normalizeReadText(term) + " "));
}
