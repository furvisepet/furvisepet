/** Broaden already-validated single-word substring queries to inflection stems.
 * Every result is a prefix of the original term, so existing literal matches
 * remain candidates. This is retrieval only, never fact or write authority.
 * Phrases and short/unknown forms remain literal; source review handles noise. */
export function normalizeHistoricalSearchTerms(terms: string[]): string[] {
  return [...new Set(terms.map(term => {
    const word = term.toLowerCase();
    // Broaden common record vocabulary without granting semantic fact authority.
    // These prefixes preserve matches on the original phrase as well.
    if (/^weigh(?:t|ts|ed|ing)?$/.test(word)) return "weigh";
    if (/^stiff(?:ness)?$/.test(word)) return "stiff";
    if (/^litter[ -](?:box|boxes|tray|trays)$/.test(word)) return "litter";
    if (/^medic(?:ation|ations|ine|ines)$/.test(word)) return "medic";
    if (!/^[a-z]+$/.test(word) || word.length < 4) return term;
    let stem = word;
    if (word.length > 5 && /ing$/.test(word)) stem = word.slice(0,-3);
    else if (word.length > 5 && /ed$/.test(word)) stem = word.slice(0,-2);
    else if (word.length > 5 && /ies$/.test(word)) stem = word.slice(0,-3);
    else if (word.length > 4 && /s$/.test(word) && !/(?:ss|us|is)$/.test(word)) stem = word.slice(0,-1);
    if (stem.length > 3 && /e$/.test(stem)) stem = stem.slice(0,-1);
    if (stem.length > 3 && /([bdfgmnprt])\1$/.test(stem)) stem = stem.slice(0,-1);
    return stem.length >= 3 && word.startsWith(stem) ? stem : term;
  }))];
}
