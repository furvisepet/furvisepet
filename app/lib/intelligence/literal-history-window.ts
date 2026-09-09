/** Recover unambiguous literal calendar windows independently of model hints.
 * This narrows a validated history read; it grants no subject or write authority. */
export function literalHistoryReportDayWindow(text: string): {from: string; to: string} | null {
  // Only a specifically dated report is a one-day lookup. A comparison, event
  // date, cutoff or relative endpoint may require other records as well.
  if (!/\b(?:note|entry|report|record)\b/i.test(text)
    || /\b(?:before|after|since|until|between|from|as of|compar\w*|versus|vs|latest|earliest|current|previous|earlier|later)\b/i.test(text)) return null;
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
