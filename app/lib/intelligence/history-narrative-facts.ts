import { isStructuredHistoryText } from "./structured-history-text.ts";
type Source = { text: string; occurredAt?: string | null; petId?: string };
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
export function historyNarrativeAnchorsSupported(text: string, sources: Source[], requestText = "", derivedQuantities: readonly string[] = [], legacyDerivations = true, scopeDates: readonly string[] = []): boolean {
  // Relative words in old records must not become an undated current claim.
  const prose = text.replace(/"[^"]*"|“[^”]*”/g, "");
  // Missing documentation cannot support a claim that a clinical act never occurred.
  // Reject this stronger prose and let source-attributed fallback preserve the note.
  const clinicalNonoccurrence = /\b(?:did not|didn't|never)\s+(?:establish|give|make|reach|confirm)\s+(?:a|any|the)\s+diagnosis\b|\bno diagnosis\s+(?:was|has been)\s+(?:made|given|established|confirmed)\b|\b(?:was not|wasn't|never was)\s+diagnosed\b/i;
  if (clinicalNonoccurrence.test(prose)
    && !sources.some(source => clinicalNonoccurrence.test(source.text))) return false;
  if (/\b(?:today|yesterday)\b/i.test(prose) && !dates(prose).length
    && !sources.every(source => source.occurredAt?.slice(0, 10) === new Date().toISOString().slice(0, 10))) return false;
  // A displayed quotation must be an exact substring of one source. Dates
  // outside the quotation must identify that source, not a different citation.
  for (const match of (isStructuredHistoryText(text) ? [] : text.matchAll(/"([^"]+)"|“([^”]+)”/g))) {
    const quote = match[1] ?? match[2];
    const matching = sources.filter(source => source.text.includes(quote));
    if (!matching.length) return false;
    const attribution = dates(text.slice(0, match.index));
    if (attribution.length && !matching.some(source => {
      const recorded = dates(source.occurredAt?.slice(0, 10) || "");
      return attribution.every(date => recorded.some(value => value === date || value.replace(/^\d{4}:/, "") === date));
    })) return false;
  }
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
  const supportedDates = new Set([...sourceDates, ...scopeDates.flatMap(date => dates(date))].flatMap(date => [date, date.replace(/^\d{4}:/, "")]));
  const supportedQuantities = new Set([...sources.flatMap(source => quantities(source.text)), ...derivedQuantities]);
  // Two separately dated, explicitly reported urination events can support a
  // count within that note. This never authorizes illness-episode totals.
  if (legacyDerivations && /\b(?:how many accidents|one accident or two|one or two accidents)\b/i.test(requestText) && /\b(?:note|entry|report)\b/i.test(requestText)
    && !/\b(?:ever|lifetime|episodes?)\b/i.test(requestText)) {
    for (const source of sources) {
      const sentence = source.text.split(/(?<=[.!?])\s+/).find(part =>
        /\burinated on\b[^.!?]{1,80}\bonce yesterday and once today\b/i.test(part));
      if (sentence && !/\b(?:not|never|may|might|maybe|could|if|whether|possibly)\b/i.test(sentence)) supportedQuantities.add("2:accident");
    }
  }
  // Permit arithmetic only for explicit, dated measurements of the same pet.
  // Semantic review remains responsible for direction and endpoint relevance.
  if (legacyDerivations && /\bweight\b/i.test(requestText) && /\b(?:change|difference|earliest|latest)\b/i.test(requestText)) {
    const groups = new Map<string, { at: number; grams: number }[]>();
    const invalid = new Set<string>();
    for (const source of sources) {
      if (!source.petId) continue;
      const matches = [...source.text.matchAll(/\b(\d+(?:\.\d{1,3})?)\s*kg\b/gi)];
      if (!matches.length) continue;
      const at = Date.parse(source.occurredAt || "");
      if (matches.length !== 1 || !Number.isFinite(at)
        || /\b(?:may|might|maybe|approximately|about|not|never|or|correction|incorrect|estimated)\b/i.test(source.text)
        || !/\b(?:weighed|weighs|weight)\b/i.test(source.text)) {
        invalid.add(source.petId);
        continue;
      }
      const measurements = groups.get(source.petId) || [];
      measurements.push({ at, grams: Math.round(Number(matches[0][1]) * 1000) });
      groups.set(source.petId, measurements);
    }
    for (const [petId, measurements] of groups) {
      if (invalid.has(petId) || measurements.length < 2) continue;
      measurements.sort((a, b) => a.at - b.at);
      if (measurements.some((value, i) => i > 0 && value.at === measurements[i - 1].at)) continue;
      supportedQuantities.add(`${Math.abs(measurements.at(-1)!.grams - measurements[0].grams) / 1000}:kg`);
    }
  }
  // A derived calendar interval is not a reported symptom duration. Require
  // an explicit elapsed-day question and two uniquely grounded endpoints.
  // Semantic review still checks the meaning of the complete sentence.
  if (legacyDerivations && /\bhow many days\s+(?:are there|passed|elapsed|between|from|apart|separate)\b/i.test(requestText)
    && new Set(sources.map(source => source.petId)).size === 1) {
    const requested = dates(requestText);
    const grounded = requested.map(date => [...new Set(sourceDates.filter(value =>
      /^\d{4}:/.test(value) && (value === date || value.replace(/^\d{4}:/, "") === date)))]);
    if (requested.length === 2 && grounded.every(values => values.length === 1)) {
      const instants = grounded.map(values => {
        const [year, month, day] = values[0].split(/[:-]/).map(Number);
        const instant = Date.UTC(year, month - 1, day);
        const parsed = new Date(instant);
        return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1
          && parsed.getUTCDate() === day ? instant : NaN;
      });
      const elapsed = (instants[1] - instants[0]) / 86400000;
      if (Number.isSafeInteger(elapsed) && elapsed >= 0) supportedQuantities.add(elapsed + ":day");
    }
  }
  return dates(text).every(date => supportedDates.has(date))
    && quantities(text).every(quantity => supportedQuantities.has(quantity));
}
