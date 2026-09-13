

/** Explicit calendar labels constrain retrieval; they never establish an event. */
export function explicitHistoryDays(question: string, year: number, maximumDays = 2): string[] {
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const matches=[...question.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/gi)];
 // A shared month in "September 13 and 14 entries" is still two explicit days.
 const coordinated=matches.flatMap(m=>{
  const tail=question.slice(m.index!+m[0].length);
  const next=/^\s+and\s+(\d{1,2})(?:,?\s+(\d{4}))?(?=\s+(?:notes?|entries|reports?)\b|\s*[?.!,]|\s*$)/i.exec(tail);
  if(next?.[2] && !m[3])m[3]=next[2];
  return next ? [[next[0],m[1],next[1],next[2]||m[3]]] : [];
 });
 const labels=[...matches,...coordinated];
 if(!Number.isInteger(year)||year<1900||year>2099||labels.length<1||!Number.isInteger(maximumDays)||maximumDays<1||maximumDays>8||labels.length>maximumDays) return [];
 // A single explicit year scopes coordinated named dates; conflicting years stay explicit.
 const years=[...new Set(labels.map(m=>m[3]).filter(Boolean))];
 const sharedYear=years.length===1?years[0]:year;
 const days=labels.map(m=>`${m[3]||sharedYear}-${String(months.indexOf(m[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`);
 return days.every(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&d>='1900-01-01'&&d<'2100-01-01') ? days : [];
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
  const names = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const found: string[] = [];
  const pattern = new RegExp("\\b(" + names.map(name => name.slice(0,3) + "(?:" + name.slice(3) + ")?").join("|") + ")\\.?\\s+(19\\d{2}|20\\d{2}|2100)\\b", "gi");
  for (const match of text.matchAll(pattern)) found.push(match[2] + "-" + String(names.findIndex(name => name.startsWith(match[1].slice(0,3).toLowerCase())) + 1).padStart(2,"0"));
  for (const match of text.matchAll(/\b(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])(?!-\d{2})\b/g)) found.push(match[0]);
  return [...new Set(found)].sort();
}

export function literalHistoryMonthWindow(text: string): {from: string; to: string} | null {
  // Relative/open bounds and comparisons against an unspecified endpoint need
  // the semantic planner; do not silently narrow them to one named month.
  if (/\b(?:before|after|since|until|between|from|as of)\b/i.test(text)) return null;
  const months=["january","february","march","april","may","june","july","august","september","october","november","december"];
  const found: Array<{year:number;month:number}>=[];
  const pattern=new RegExp("\\b("+months.join("|")+")\\s+(19\\d{2}|20\\d{2}|2100)\\b","gi");
  for(const match of text.matchAll(pattern)) found.push({year:Number(match[2]),month:months.indexOf(match[1].toLowerCase())});
  for(const match of text.matchAll(/\b(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])(?!-\d{2})\b/g)) found.push({year:Number(match[1]),month:Number(match[2])-1});
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
