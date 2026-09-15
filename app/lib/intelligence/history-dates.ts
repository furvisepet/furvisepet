

/** Explicit calendar labels constrain retrieval; they never establish an event. */
const literalMonthNumbers = new Map<string, number>();
for (const locale of ["en", "es", "fr", "de", "ar"]) {
  for (let month = 0; month < 12; month++) {
    for (const style of ["long", "short"] as const) {
      const label = new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" })
        .format(new Date(Date.UTC(2024, month, 1))).toLowerCase().replace(/\.$/, "");
      literalMonthNumbers.set(label, month + 1);
    }
  }
}
// Retain the short English labels accepted by the original parser.
for (const [month, name] of ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].entries()) literalMonthNumbers.set(name, month + 1);
const literalMonthPattern = [...literalMonthNumbers.keys()].sort((a, b) => b.length - a.length)
  .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

export function explicitHistoryDays(question: string, year: number, maximumDays = 2): string[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2099 || !Number.isInteger(maximumDays) || maximumDays < 1 || maximumDays > 8) return [];
  // Literal anchors only: ambiguous slash dates and translated interpretations
  // remain the semantic planner's responsibility. These hints grant no scope.
  const text = question.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)));
  const labels: Array<{ index: number; month: number; day: number; year?: number }> = [];
  const monthFirst = new RegExp("(?<![\\p{L}\\p{N}])(?:و(?=[\\p{Script=Arabic}]))?(" + literalMonthPattern + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![\\p{L}\\p{N}])", "giu");
  for (const match of text.matchAll(monthFirst)) {
    const label = { index: match.index!, month: literalMonthNumbers.get(match[1].toLowerCase())!, day: Number(match[2]), year: match[3] ? Number(match[3]) : undefined };
    const next = /^\s+and\s+(\d{1,2})(?:,?\s+(\d{4}))?(?=\s+(?:notes?|entries|reports?)\b|\s*[?.!,]|\s*$)/i.exec(text.slice(match.index! + match[0].length));
    if (next?.[2] && !label.year) label.year = Number(next[2]);
    labels.push(label);
    if (next) labels.push({ ...label, index: match.index! + match[0].length, day: Number(next[1]), year: next[2] ? Number(next[2]) : label.year });
  }
  // Day-first international forms require a year to avoid interpreting a
  // duration or an unrelated month mention as a dated record.
  const dayFirst = new RegExp("(?<![\\p{N}])(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(?:de\\s+)?(" + literalMonthPattern + ")\\.?\\s+(?:de\\s+)?(\\d{4})(?!\\d)", "giu");
  for (const match of text.matchAll(dayFirst)) {
    const label = { index: match.index!, day: Number(match[1]), month: literalMonthNumbers.get(match[2].toLowerCase())!, year: Number(match[3]) };
    const prior = /(?<!\d)(\d{1,2})\s+(?:and|y|et|und|و)\s+(?:(?:el|del|le|den)\s+)?$/iu.exec(text.slice(0, match.index));
    if (prior) labels.push({ ...label, index: match.index! - prior[0].length, day: Number(prior[1]) });
    labels.push(label);
  }
  for (const match of text.matchAll(/(?<!\d)(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/gu)) labels.push({ index: match.index!, year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
  const years = [...new Set(labels.map(label => label.year).filter((value): value is number => value !== undefined))];
  const sharedYear = years.length === 1 ? years[0] : year;
  const days = [...new Set(labels.sort((a,b) => a.index - b.index).map(label => `${label.year ?? sharedYear}-${String(label.month).padStart(2,"0")}-${String(label.day).padStart(2,"0")}`))];
  if (!days.length || days.length > maximumDays) return [];
  return days.every(day => Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day && day >= "1900-01-01" && day < "2100-01-01") ? days : [];
}
export function normalizeExplicitHistoryDates(p: Record<string,unknown>, question: string) {
 if(!['recall','comparison','status','overview'].includes(String(p.operation))||p.ordinal!==null) return;
 const valid=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(p.from!==null&&!valid(p.from)||p.to!==null&&!valid(p.to)) return;
 const anchor=valid(p.from)?p.from:valid(p.to)?p.to:null;
 const days=explicitHistoryDays(question,anchor?Number(anchor.slice(0,4)):new Date().getUTCFullYear());
 const after=(d:string)=>new Date(Date.parse(d)+86400000).toISOString().slice(0,10);
 if(days.length===1&&/\bby\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b/i.test(question)
   && !/\b(?:after|before|since|from|between|until|last year|previous year|ago)\b/i.test(question)
   && [null,'1900-01-01',days[0]].includes(p.from as string|null)
   && [null,days[0],after(days[0])].includes(p.to as string|null)) {
   p.from='1900-01-01';p.to=after(days[0]);p.selection='period';
 }
 if(days.length===2&&/\b(?:compare|comparison|versus|vs)\b/i.test(question)
   && days[0]<days[1]&&((p.from===null&&p.to===null)
     || p.from===days[0]&&[days[1],after(days[1]),after(days[0])].includes(String(p.to)))
   && Array.isArray(p.terms)&&p.terms.length<=6&&p.terms.every(t=>typeof t==='string'&&t.length>=3&&t.length<=32&&/^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(t))) {
   p.from=days[0];p.to=after(days[1]);p.selection='period';p.terms=[];
 }
}

/** Recover unambiguous literal calendar windows independently of model hints.
 * This narrows a validated history read; it grants no subject or write authority. */
export function literalHistoryReportDayWindow(text: string): {from: string; to: string} | null {
  // Only a specifically dated report is a one-day lookup. A comparison, event
  // date, cutoff or relative endpoint may require other records as well.
  if (!/\b(?:note|entry|report|record)\b/i.test(text)
    || /\b(?:before|after|since|until|between|from|as of|compar\w*|versus|vs|latest|earliest|current|previous|earlier|later)\b/i.test(text)) return null;
  return explicitHistoryDayWindow(text);
}

/** Parse one literal date without assigning retrieval semantics. Callers must
 * independently establish whether that date bounds the entire requested task. */
export function explicitHistoryDayWindow(text: string): {from: string; to: string} | null {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const found: Array<{year: number; month: number; day: number}> = [];
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    found.push({year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3])});
  }
  for (const match of text.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+)(\d{4})\b/gi)) {
    found.push({year: Number(match[3]), month: months.indexOf(match[1].slice(0, 3).toLowerCase()), day: Number(match[2])});
  }
  const unique = [...new Map(found.map(date => [`${date.year}-${date.month}-${date.day}`, date])).values()];
  if (unique.length !== 1) return null;
  const {year, month, day} = unique[0];
  const start = new Date(Date.UTC(year, month, day));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month || start.getUTCDate() !== day) return null;
  return {from: start.toISOString().slice(0, 10), to: new Date(start.getTime() + 86400000).toISOString().slice(0, 10)};
}

/** Literal anchors are separate reads, not global bounds. A comparison or
 * open-ended request still needs the named month plus its other context. */
export function explicitHistoryMonths(text: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp("(?<![\\p{L}\\p{N}])(?:و(?=[\\p{Script=Arabic}]))?(" + literalMonthPattern + ")\\.?\\s+(?:de\\s+)?(19\\d{2}|20\\d{2}|2100)(?!\\d)", "giu");
  for (const match of text.matchAll(pattern)) {
    // A day-first date already has its own exact-day query. Do not consume a
    // second query on its incidental month/year substring.
    if (/(?<!\d)\d{1,2}(?:st|nd|rd|th|\.)?\s+(?:de\s+)?$/iu.test(text.slice(0, match.index))) continue;
    found.push(match[2] + "-" + String(literalMonthNumbers.get(match[1].toLowerCase())).padStart(2,"0"));
    // A coordinated month list shares the trailing year. Without this, a
    // whole-request window can incorrectly narrow July and August to August.
    const prefix = text.slice(0, match.index);
    const coordinated = new RegExp("(" + literalMonthPattern + ")\\.?\\s*(?:,\\s*|(?:and|y|et|und|و)\\s+)$", "iu").exec(prefix);
    if (coordinated) found.push(match[2] + "-" + String(literalMonthNumbers.get(coordinated[1].toLowerCase())).padStart(2,"0"));
  }
  for (const match of text.matchAll(/\b(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])(?!-\d{2})\b/g)) found.push(match[0]);
  for (const match of text.matchAll(/(?<!\d)(19\d{2}|20\d{2}|2100)年\s*(1[0-2]|0?[1-9])月(?!\s*\d{1,2}日)/gu)) found.push(match[1]+"-"+match[2].padStart(2,"0"));
  return [...new Set(found)].sort();
}

export function literalHistoryMonthWindow(text: string): {from: string; to: string} | null {
  // Relative/open bounds and comparisons against an unspecified endpoint need
  // the semantic planner; do not silently narrow them to one named month.
  if (/\b(?:before|after|since|until|between|from|as of)\b/i.test(text)) return null;
  const found = explicitHistoryMonths(text).map(label => ({year:Number(label.slice(0,4)),month:Number(label.slice(5,7))-1}));
  const unique=[...new Map(found.map(x=>[x.year+":"+x.month,x])).values()].sort((a,b)=>a.year-b.year||a.month-b.month);
  if(!unique.length||unique.length>2)return null;
  if(unique.length===1&&/\b(?:compar\w*|versus|vs\.?|latest|earliest|current)\b/i.test(text))return null;
  const first=unique[0],last=unique.at(-1)!;
  return {from:new Date(Date.UTC(first.year,first.month,1)).toISOString().slice(0,10),to:new Date(Date.UTC(last.year,last.month+1,1)).toISOString().slice(0,10)};
}

/** The present endpoint must survive a planner's single historical interval.
 * This recovers read coverage only; the ordinary access filter still applies. */
export function requestsPastPresentComparison(text: string): boolean {
  if (/\b(?:as of|until|before today|only|excluding|exclude)\b/i.test(text)) return false;
  const present = /\b(?:now|today|current|currently|latest|present)\b/i.test(text);
  const past = /\b(?:19\d{2}|20\d{2}|2100|then|previous|previously|earlier|used to)\b/i.test(text);
  const comparison = /\b(?:same|different|compar\w*|versus|vs|than|chang\w*|heavier|lighter|higher|lower|greater|less|more|increase\w*|decrease\w*|difference)\b/i.test(text);
  return present && past && comparison;
}

export type EvidenceNeedWindow = { from: string; to: string };
/** A single standalone calendar year, not a cutoff, date or comparison. */
export function literalHistoryYearWindow(text: string): EvidenceNeedWindow | undefined {
  const years = [...new Set(text.match(/\b(?:19|20)\d{2}\b/g) || [])];
  if (years.length !== 1 || /\b(?:before|after|since|until|between|from|as of)\b/i.test(text)
    || requestsPastPresentComparison(text) || explicitHistoryMonths(text).length
    || explicitHistoryDays(text, Number(years[0]), 8).length || /\b\d{4}-\d{2}/.test(text)) return;
  return { from: `${years[0]}-01-01T00:00:00.000Z`, to: `${Number(years[0]) + 1}-01-01T00:00:00.000Z` };
}
/** Only a single explicit calendar label in a validated USER quote supplies a
 * local interval. Ambiguous/open comparisons retain the planner's wider scope. */
export function evidenceNeedWindow(quote: string): EvidenceNeedWindow | undefined {
  if (!/\b(?:19|20)\d{2}\b/.test(quote)
    || /\b(?:before|after|since|until|between|as of|earlier|later|this year|last year|next year)\b/i.test(quote)
    || requestsPastPresentComparison(quote)) return;
  const days = [...new Set([...explicitHistoryDays(quote, new Date().getUTCFullYear(), 8),
    ...(quote.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])])];
  const labels = [...days, ...explicitHistoryMonths(quote)];
  if (!labels.length) return literalHistoryYearWindow(quote.replace(/\bfrom\s+(?=(?:19|20)\d{2}(?:\s*[.,!?;:]|\s*$))/gi, "in "));
  if (labels.length !== 1) return;
  const label = labels[0], start = label.length === 7 ? label + "-01" : label;
  if (!Number.isFinite(Date.parse(start)) || new Date(start).toISOString().slice(0,10) !== start) return;
  return { from: new Date(start).toISOString(), to: label.length === 7
    ? new Date(Date.UTC(Number(label.slice(0,4)),Number(label.slice(5,7)),1)).toISOString()
    : new Date(Date.parse(start)+86400000).toISOString() };
}
export function withinEvidenceNeedWindow(occurredAt: string | null | undefined, window?: EvidenceNeedWindow) {
  if (!window) return true;
  const time = occurredAt ? Date.parse(occurredAt) : NaN;
  return Number.isFinite(time) && time >= Date.parse(window.from) && time < Date.parse(window.to);
}
