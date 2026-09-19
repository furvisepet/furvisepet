/** Isolate Latin clinical notation inside right-to-left prose without rewriting it. */
export function briefTextDirection(text: string): "ltr" | "rtl" {
  const letters = text.match(/\p{Letter}/gu) || [];
  const rtl = letters.filter(letter => /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/u.test(letter)).length;
  return rtl > letters.length / 2 ? "rtl" : "ltr";
}

export function briefTextRuns(text: string) {
  const runs: Array<{ text: string; isolate: boolean }> = [];
  const notation = /\b[A-Za-z]{3,9} [0-9]{1,2}, [0-9]{4}\b|[A-Za-z0-9](?:[A-Za-z0-9._/:+\-\u2010-\u2015]*[A-Za-z0-9])?(?:[ \u00a0]+(?:mg\/dL|mmol\/L|g\/dL|mEq\/L|kg|mg|mcg|µg|mL|IU|%))?/gu;
  let start = 0;
  for (const match of text.matchAll(notation)) {
    if (match.index > start) runs.push({ text: text.slice(start, match.index), isolate: false });
    runs.push({ text: match[0], isolate: true });
    start = match.index + match[0].length;
  }
  if (start < text.length) runs.push({ text: text.slice(start), isolate: false });
  return runs;
}
