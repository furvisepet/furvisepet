type Source = { text: string; occurredAt?: string | null };
const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const words: Record<string, number> = {one:1,single:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
function dates(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) found.push(`${match[1]}:${Number(match[2])}-${Number(match[3])}`);
  for (const match of text.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi)) {
    found.push(`${match[3] ? match[3] + ":" : ""}${months.indexOf(match[1].slice(0,3).toLowerCase())+1}-${Number(match[2])}`);
  }
  return found;
}
function quantities(text: string): string[] {
  return [...text.toLowerCase().matchAll(/\b(\d+(?:\.\d+)?|one|single|two|three|four|five|six|seven|eight|nine|ten)[ -]+(kg|mg|ml|g|lbs?|pounds?|days?|weeks?|hours?|soft stools?|stools?|accidents?|episodes?|bouts?|courses?)\b/g)]
    .map(match => `${words[match[1]] ?? Number(match[1])}:${match[2].replace(/s$/, "").replace(/^soft /, "").replace(/^pound$/, "lb")}`);
}
/** A deterministic guard for explicit factual anchors, not semantic entailment.
 * Each sentence must draw its dates/quantities from its cited sources. This
 * prevents an approving model from manufacturing a date or dose. */
export function historyNarrativeAnchorsSupported(text: string, sources: Source[]): boolean {
  const sourceDates = sources.flatMap(source => {
    const explicit = dates(source.text);
    const timestamp = source.occurredAt?.slice(0, 10);
    if (!timestamp) return explicit;
    const relative = /\byesterday\b/i.test(source.text);
    const attributed = /\b(?:note|report|entry|update)\b/i.test(text);
    if (!relative || attributed || /\btoday\b/i.test(source.text)) explicit.push(...dates(timestamp));
    if (relative) {
      const day = new Date(timestamp + "T12:00:00Z");
      if (Number.isFinite(day.getTime())) {
        day.setUTCDate(day.getUTCDate() - 1);
        explicit.push(...dates(day.toISOString().slice(0, 10)));
      }
    }
    return explicit;
  });
  const supportedDates = new Set(sourceDates.flatMap(date => [date, date.replace(/^\d{4}:/, "")]));
  const supportedQuantities = new Set(sources.flatMap(source => quantities(source.text)));
  return dates(text).every(date => supportedDates.has(date))
    && quantities(text).every(quantity => supportedQuantities.has(quantity));
}
