import { units } from "../furvise-brain/calculation-units.ts";

/** A lexical proposal vocabulary, never a classifier of dates, labels or intent.
 * Brain alone decides whether any of these exact spans is a supplied quantity.
 * Binder independently checks source identity, uniqueness, syntax and units. */
export function currentUserNumericQuotes(text: string): string[] {
  const quotes = new Set<string>();
  for (const match of text.matchAll(/[+\u2212-]?\d+(?:\.\d+)?/gu)) {
    const suffix = /^\s*([A-Za-z]+)/u.exec(text.slice(match.index! + match[0].length));
    const quote = match[0] + (suffix && Object.hasOwn(units, suffix[1].toLowerCase()) ? suffix[0] : "");
    const start = text.indexOf(quote);
    if (quote.length <= 400 && text.indexOf(quote, start + 1) < 0) quotes.add(quote);
  }
  // Bound the provider vocabulary, not the meaning of any source text.
  // Over-budget requests retain other request branches; never fall back to free quotes.
  return quotes.size <= 256 ? [...quotes] : [];
}
