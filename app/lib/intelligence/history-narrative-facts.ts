import { calendarDateInZone } from "../ask-time-zone.ts";
import { explicitLeadingSourceDate, sourceDisplayDate } from "./source-calendar-date.ts";
import {compoundUnit, units} from "./history-calculation.ts";
import { isStructuredHistoryText } from "../furvise-output.ts";
type Source = { text: string; occurredAt?: string | null; recordedAt?: string | null; petId?: string; sourceId?: string; sourceType?: string };
const monthPattern = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const words: Record<string, number> = {one:1,single:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
type CalendarToken = {start: number; end: number; anchor: string};
function calendarTokens(text: string): CalendarToken[] {
  const found: CalendarToken[] = [];
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) found.push({start:match.index!,end:match.index!+match[0].length,anchor:`${match[1]}:${Number(match[2])}-${Number(match[3])}`});
  // A shared month/year applies to both explicit endpoints, not just the
  // first day. Keep the whole span masked from quantity parsing; do not
  // invent intermediate dates or infer a year from another observation.
  const range = new RegExp("\\b("+monthPattern+")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*[\u2013\u2014-]\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b(?![.,]\\d)", "gi");
  for (const match of text.matchAll(range)) {
    const month = months.indexOf(match[1].slice(0,3).toLowerCase()) + 1;
    const start = Number(match[2]), end = Number(match[3]);
    const year = match[4] ? Number(match[4]) : 2000;
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (start < 1 || end < start || end > maxDay) continue;
    const nextWord = /^\s+([a-z]+)\b/i.exec(text.slice(match.index!+match[0].length))?.[1]?.toLowerCase();
    if (!match[4] && nextWord && units[nextWord]) continue;
    for (const day of new Set([start, end])) found.push({start:match.index!,end:match.index!+match[0].length,anchor:`${match[4] ? match[4]+":" : ""}${month}-${day}`});
  }
  // Recognize the date before looking for month-first dates. Otherwise
  // "3. August 31 g" invents August 31 and erases the actual 31 g measurement.
  const dayFirst = new RegExp("(?<![\\p{L}\\p{N}])(\\d{1,2})(st|nd|rd|th|\\.)?\\s+("+monthPattern+")\\.?(?:\\s+(\\d{4}))?(?![\\p{L}\\p{N}])", "giu");
  for (const match of text.matchAll(dayFirst)) {
    if (found.some(token => match.index! >= token.start && match.index! < token.end)) continue;
    if (match[3] === "may" && !match[2] && !match[4] && !/\b(?:on|dated)\s+$/i.test(text.slice(0,match.index))) continue;
    found.push({start:match.index!,end:match.index!+match[0].length,anchor:`${match[4] ? match[4]+":" : ""}${months.indexOf(match[3].slice(0,3).toLowerCase())+1}-${Number(match[1])}`});
  }
  const monthFirst = new RegExp("\\b("+monthPattern+")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b(?![.,]\\d)", "gi");
  for (const match of text.matchAll(monthFirst)) {
    if (found.some(token => match.index! >= token.start && match.index! < token.end)) continue;
    // A month followed directly by a measured quantity is not a day label.
    const nextWord = /^\s+([a-z]+)\b/i.exec(text.slice(match.index!+match[0].length))?.[1]?.toLowerCase();
    if (!match[3] && nextWord && units[nextWord]) continue;
    found.push({start:match.index!,end:match.index!+match[0].length,anchor:`${match[3] ? match[3]+":" : ""}${months.indexOf(match[1].slice(0,3).toLowerCase())+1}-${Number(match[2])}`});
  }
  return found.sort((a,b)=>a.start-b.start);
}
function dates(text: string): string[] { return calendarTokens(text).map(token=>token.anchor); }
function withoutCalendarDates(text: string) {
  const spans = new Map(calendarTokens(text).map(token => [`${token.start}:${token.end}`, token]));
  for (const token of [...spans.values()].sort((a,b)=>b.start-a.start)) text=text.slice(0,token.start)+" "+text.slice(token.end);
  return text;
}
export function historyQuantityAnchors(text: string): string[] {
  // Date tokens cannot also be quantities: "April 17 accident-free update"
  // contains a day number, not seventeen accidents. Keep the two anchor axes separate.
  // Normalize whole numeric tokens before unit extraction. Without this, a
  // localized decimal such as 3,8 kg was incorrectly anchored as 8 kg.
  // Preserve established English thousands groups; unambiguous decimal commas
  // carry their sign and fractional precision into both scalars and rates.
  const numericText = text.replaceAll("−", "-")
    .replace(/(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d.,])/g, value => value.replaceAll(",", ""))
    .replace(/(?<![\d.,])([+-]?\d+),(\d{1,2}|\d{4,})(?![\d.,])/g, "$1.$2")
    // Unit spacing is presentation, not a different source quantity: 5mg = 5 mg.
    .replace(/(?<![\p{L}\p{N}_.,+-])([+-]?\d+(?:\.\d+)?)(?=(?:kg|mg|ml|g|lbs?|km|cm|mm|m)\b)/giu, "$1 ");
  const prose = withoutCalendarDates(numericText)
    .replace(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}\b/gi, " ");
  const rates: string[] = [];
  const scalarProse = prose.replace(/\b(calendar|elapsed)[ -]+(days?)\b/gi, "$2").replace(/(?<![\p{L}\p{N}_.,+-])([+-]?\d+(?:\.\d+)?)\s+([a-z]+\s*\/\s*[a-z]+)\b/giu, (literal, value, unit) => {
    const rate = compoundUnit(unit);
    if (!rate) return literal;
    rates.push(Number(value) + ":" + rate.canonical);
    return " ";
  });
  return [...rates, ...[...scalarProse.toLowerCase().matchAll(/(?<![\p{L}\p{N}_.,+-])([+-]?\d+(?:\.\d+)?|one|single|two|three|four|five|six|seven|eight|nine|ten)[ -]+(kilograms?|grams?|milligrams?|milliliters?|kg|mg|ml|g|lbs?|pounds?|days?|weeks?|hours?|minutes?|seconds?|soft stools?|stools?|accidents?|episodes?|records?|notes?|entries|entry|bouts?|courses?|cad|usd|eur|gbp|aud|nzd|jpy|chf|cny|km|cm|mm|m)\b/gu)]
    .map(match => `${words[match[1]] ?? Number(match[1])}:${match[2].replace(/s$/, "").replace(/^entrie$/, "entry").replace(/^soft /, "").replace(/^pound$/, "lb").replace(/^kilogram$/, "kg").replace(/^milligram$/, "mg").replace(/^gram$/, "g").replace(/^milliliter$/, "ml")}`)];
}

const quantities = historyQuantityAnchors;

/** Candidate bindings for a repair writer, never an approval or new evidence.
 * Literal dates identify possible records; semantic review must still verify
 * the subject, occasion and complete claim against the original source. */
function sourceDateAnchors(source: Source, timeZone = "UTC") {
  const explicit = dates(source.text);
  const leading = explicitLeadingSourceDate(source.text);
  const display = sourceDisplayDate(source.text, source.occurredAt, timeZone);
  return leading || !display ? explicit : [...explicit, ...dates(display)];
}

export function historyDateBindingHints(text: string, sources: Array<Source & {sourceId: string}>, timeZone = "UTC") {
  return [...new Set(dates(text))].map(anchor => ({ anchor, sourceIds: sources.filter(source =>
    sourceDateAnchors(source, timeZone).some(date => date === anchor || date.replace(/^\d{4}:/, "") === anchor))
    .map(source => source.sourceId) }));
}

function equivalentQuantity(target: string, candidates: readonly string[]) {
  const split = (value: string) => {
    const separator = value.lastIndexOf(":");
    const amount = Number(value.slice(0, separator));
    const unit = units[value.slice(separator + 1).toLowerCase()];
    const literal = value.slice(0, separator);
    return separator > 0 && Number.isFinite(amount) && unit ? { amount, decimals: literal.split(".")[1]?.length || 0, unit } : null;
  };
  const wanted = split(target);
  if (!wanted) return false;
  return candidates.some(candidate => {
    const source = split(candidate);
    if (!source || source.unit.dimension !== wanted.unit.dimension) return false;
    const converted = source.amount * source.unit.scale / wanted.unit.scale;
    return Number(converted.toFixed(Math.min(wanted.decimals, 10))) === wanted.amount;
  });
}
/** A deterministic guard for explicit factual anchors, not semantic entailment.
 * Each sentence must draw its dates/quantities from its cited sources. This
 * prevents an approving model from manufacturing a date or dose. */
export function historyNarrativeAnchorsSupported(text: string, sources: Source[], requestText = "", derivedQuantities: readonly string[] = [], legacyDerivations = true, scopeDates: readonly string[] = [], onUnsupported?: (reason: string) => void, serializedResult = false, proposedTexts: readonly string[] = [], timeZone = "UTC"): boolean {
  // Relative words in old records must not become an undated current claim.
  const prose = text.replace(/"[^"]*"|“[^”]*”/g, "");
  // A creation timestamp and an event timestamp are separate facts. Do not
  // let a matching numeric/date anchor certify the wrong timestamp label.
  for (const match of prose.matchAll(/\b(?:recorded|saved|created|logged|entered|added)\s+(?:at|on)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))/gi)) {
    const instant = Date.parse(match[1]);
    if (!sources.some(source => Number.isFinite(instant) && Date.parse(source.recordedAt || "") === instant)) {
      onUnsupported?.("Recording timestamp does not match a cited source creation time");
      return false;
    }
  }
  // Missing documentation cannot support a claim that a clinical act never occurred.
  // Reject this stronger prose and let source-attributed fallback preserve the note.
  const clinicalNonoccurrence = /\b(?:did not|didn't|never)\s+(?:establish|give|make|reach|confirm)\s+(?:a|any|the)\s+diagnosis\b|\bno diagnosis\s+(?:was|has been)\s+(?:made|given|established|confirmed)\b|\b(?:was not|wasn't|never was)\s+diagnosed\b/i;
  if (clinicalNonoccurrence.test(prose)
    && !sources.some(source => clinicalNonoccurrence.test(source.text))) return false;
  // Shared requests leave relative-time meaning (including unknown today) to
  // independent semantic review; explicit dates and quantities remain guarded.
  if (legacyDerivations && /\b(?:today|yesterday)\b/i.test(prose) && !dates(prose).length
    && !sources.every(source => calendarDateInZone(source.occurredAt || "", timeZone) === calendarDateInZone(new Date().toISOString(), timeZone))) return false;
  // A displayed quotation must be an exact substring of one source. Dates
  // outside the quotation must identify that source, not a different citation.
  // Quotation marks in a typed CSV cell are serialization delimiters, not
  // verbatim prose attribution. Row-bound factual anchors still run below.
  let previousQuoteEnd = 0;
  for (const match of (serializedResult || isStructuredHistoryText(text) ? [] : text.matchAll(/"([^"]+)"|“([^”]+)”/g))) {
    // Attribution belongs to this quotation's clause. Earlier quoted notes
    // and preceding sentences may legitimately concern different dates.
    const prefix = text.slice(previousQuoteEnd, match.index).split(/\n|[.!?]\s+/).at(-1) || "";
    previousQuoteEnd = (match.index || 0) + match[0].length;
    const quote = match[1] ?? match[2];
    const matching = sources.filter(source => source.text.includes(quote));
    if (!matching.length) {
      // Quoting the user's claim to assess it is not a source quotation. This
      // grants no factual authority: the independent reviewer must still check
      // whether the answer accepts, rejects or qualifies that claim correctly.
      if (!legacyDerivations && requestText.includes(quote)) continue;
      // Quoting a prepared replacement is an artifact-fidelity check, not a
      // claim that it is already saved. Numeric/date grounding below still uses
      // original sources; independent review must verify intent and pending state.
      if (!legacyDerivations && proposedTexts.some(proposal => proposal === quote)) continue;
      onUnsupported?.("Quotation is not an exact case-sensitive source substring: " + quote);
      return false;
    }
    const attribution = dates(prefix);
    if (attribution.length && !matching.some(source => {
      const recorded = sourceDateAnchors(source, timeZone);
      return attribution.every(date => recorded.some(value => value === date || value.replace(/^\d{4}:/, "") === date));
    })) {
      onUnsupported?.("Quotation attribution date does not match its source record");
      return false;
    }
  }
  // A historical measurement is not the current profile value. The ordinary
  // literal guard below checks numbers, but cannot by itself check their time
  // authority. Keep explicitly dated/quoted reports historical; direct current
  // weight claims require a matching current profile field or owner report.
  if (!legacyDerivations) for (const match of prose.matchAll(/\b(?:current\s+(?:body\s+)?weight\s*(?:is|:)|(?:currently\s+weighs|weighs\s+(?:now|today)))\s*([+-]?\d+(?:\.\d+)?)\s*(kg|kilograms?|lb|lbs|pounds?|g|grams?)\b/gi)) {
    const prefix = prose.slice(0, match.index).split(/[.!?]\s+/).at(-1) || "";
    if (/\b(?:note|record|entry|report)\b/i.test(prefix) && dates(prefix).length) continue;
    const anchors = quantities(match[0]);
    const currentSources = sources.filter(source => source.sourceType === "current_request"
      || source.sourceType === "profile" && source.sourceId?.endsWith(":weight"));
    const currentQuantities = currentSources.flatMap(source => quantities(source.text));
    if (anchors.some(anchor => !currentQuantities.includes(anchor) && !equivalentQuantity(anchor, currentQuantities))) {
      onUnsupported?.("Current measurement lacks a matching current profile or owner-report source");
      return false;
    }
  }
  const sourceDates = sources.flatMap(source => {
    const explicit = [...sourceDateAnchors(source, timeZone), ...dates(calendarDateInZone(source.recordedAt || "", timeZone))];
    const timestamp = sourceDisplayDate(source.text, source.occurredAt, timeZone);
    if (!timestamp) return explicit;
    const relative = /\byesterday\b/i.test(source.text);
    const attributed = /\b(?:note|report|entry|update)\b/i.test(text);
    if (!legacyDerivations || !relative || attributed || /\btoday\b/i.test(source.text)) explicit.push(...dates(timestamp));
    if (relative) {
      const day = new Date(timestamp + "T12:00:00Z");
      if (Number.isFinite(day.getTime())) {
        day.setUTCDate(day.getUTCDate() - 1);
        explicit.push(...dates(day.toISOString().slice(0, 10)));
      }
    }
    return explicit;
  });
  const supportedDates = new Set([...sourceDates, ...scopeDates.flatMap(date => dates(date.slice(0, 10))), ...(!legacyDerivations ? dates(requestText) : [])].flatMap(date => [date, date.replace(/^\d{4}:/, "")]));
  const sourceQuantities = sources.flatMap(source => quantities(source.text));
  const supportedQuantities = new Set([...sourceQuantities, ...derivedQuantities]);
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
  const unsupportedDates = dates(text).filter(date => !supportedDates.has(date));
  const requestedUnitConversion = /\b(?:convert|conversion|express(?:ed)?|in\s+(?:kilograms?|grams?|milligrams?|pounds?|lbs?|milliliters?|liters?|litres?))\b/i.test(requestText);
  // Attributive record-year labels are dates, not counts ("the 2024 notes").
  // Require that year in a cited source date; explicit totals still remain
  // quantities, and independent review still checks the complete claim.
  const sourceYears = new Set(sourceDates.filter(date => /^\d{4}:/.test(date)).map(date => date.slice(0, 4)));
  const quantityText = text.replace(/\b(the|these|those|his|her|their|your|our|[\p{L}]+['’]s)\s+(?:(?:only|available|saved|matching|visible|historical|accessible|supplied|older)\s+){0,5}((?:19|20)\d{2})(?=\s+(?:notes?|records?|entries|entry)\b)/giu,
    (label, determiner, year) => sourceYears.has(year) ? `${determiner} ` : label);
  const unsupportedQuantities = quantities(quantityText).filter(quantity => !supportedQuantities.has(quantity)
    && !equivalentQuantity(quantity, derivedQuantities)
    && !(requestedUnitConversion && equivalentQuantity(quantity, sourceQuantities)));
  for (const date of unsupportedDates) onUnsupported?.("Unsupported date anchor: " + date);
  for (const quantity of unsupportedQuantities) onUnsupported?.("Unsupported quantity anchor: " + quantity + ". A derived value requires valid calculations metadata grounded in original source operands; otherwise qualify or remove it.");
  return !unsupportedDates.length && !unsupportedQuantities.length;
}
