const monthAbbreviations = new Set(["apr", "aug", "dec", "feb", "jan", "jul", "jun", "mar", "nov", "oct", "sep", "sept"]);
const titleAbbreviations = new Set(["dr", "mr", "mrs", "ms", "prof", "sr"]);
const otherAbbreviations = new Set(["approx", "e.g", "etc", "fig", "fri", "i.e", "jr", "no", "sat", "st", "sun", "thu", "thur", "tue", "tues", "vs", "wed"]);

/**
 * Splits visible prose without treating punctuation inside decimals, common
 * abbreviations, or abbreviated dates as a sentence boundary. Returned text is
 * sliced from the source; factual characters are never reconstructed.
 */
export function splitSentencesPreservingFacts(value: string) {
  const source = String(value || "");
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character !== "." && character !== "!" && character !== "?") continue;
    if (character === "." && periodBelongsInsideToken(source, index)) continue;

    let end = index + 1;
    while (/[.!?]/.test(source[end] || "")) end += 1;
    while (["'", "\"", "’", "”", "]", ")", "}"].includes(source[end] || "")) end += 1;
    pushSentence(source.slice(start, end), sentences);
    while (/\s/u.test(source[end] || "")) end += 1;
    start = end;
    index = end - 1;
  }

  pushSentence(source.slice(start), sentences);
  return sentences;
}

function periodBelongsInsideToken(source: string, index: number) {
  const before = source[index - 1] || "";
  const after = source[index + 1] || "";
  if (/\d/.test(before) && /\d/.test(after)) return true;
  if (after && !/\s/.test(after) && /[\p{L}\p{N}]/u.test(after)) return true;

  const nextIndex = nextNonWhitespaceIndex(source, index + 1);
  if (nextIndex < 0) return false;
  const prefix = source.slice(0, index);
  const word = prefix.match(/([\p{L}]+)$/u)?.[1] || "";
  const next = source[nextIndex];
  const dottedToken = source.slice(Math.max(0, index - 8), index + 1);
  if (monthAbbreviations.has(word.toLowerCase())) return /\d/.test(next);
  if (titleAbbreviations.has(word.toLowerCase())) return true;
  if (otherAbbreviations.has(word.toLowerCase())) return /[\p{Ll}\d]/u.test(next);
  if (/\b(?:e\.g|i\.e)\.$/i.test(dottedToken)) return true;
  if (/\b(?:[A-Za-z]\.){2,}$/u.test(dottedToken)) return true;
  return word.length === 1 && /[A-Z]/.test(word) && /[A-Z]/.test(source[nextIndex]);
}

function nextNonWhitespaceIndex(source: string, from: number) {
  for (let index = from; index < source.length; index += 1) {
    if (!/\s/u.test(source[index])) return index;
  }
  return -1;
}

function pushSentence(value: string, sentences: string[]) {
  const sentence = value.trim();
  if (sentence) sentences.push(sentence);
}
