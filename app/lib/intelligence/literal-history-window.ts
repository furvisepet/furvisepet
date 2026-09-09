/** Recover unambiguous literal calendar windows independently of model hints.
 * This narrows a validated history read; it grants no subject or write authority. */
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
