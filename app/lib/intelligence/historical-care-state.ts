/** Old care reports cannot establish an unattributed present care state. */
export function hasUndatedHistoricalCareState(text: string, sources: readonly { occurredAt?: string | null }[]): boolean {
  const prose = text.replace(/"[^"]*"|\u201c[^\u201d]*\u201d/g, '');
  if (!/\b(?:eats?|takes?|weighs?|(?:is|are|[\u2019']s)\s+(?:eating|taking|receiving|hiding|vomiting|recovered|healthy))\b/i.test(prose)) return false;
  const today = new Date().toISOString().slice(0,10);
  if (sources.length && sources.every(source => source.occurredAt?.slice(0,10) === today)) return false;
  // Dates and explicit reporting language retain historical attribution. The
  // independent reviewer must still check chronology and all other records.
  return !/\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+\d{1,2}\b|\b(?:notes?|reports?|records?|entries|entry)\s+(?:say|says|show|shows|describe|describes|state|states|record|records)\b|\bas of\b/i.test(prose);
}
