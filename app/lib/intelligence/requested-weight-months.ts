/** Literal disjoint calendar months for a weight display, never inferred dates. */
export function requestedWeightMonths(question: string, year: number): string[] | null {
 const text=question.replace(/"[^"]*"|\u201c[^\u201d]*\u201d/g,'');
 if(!/\bweights?\b/i.test(text) || !/\band\b/i.test(text)
   || /\b(?:from|between|through|until|since|before|after|last year|previous year|next year|ago|every|all months)\b/i.test(text)) return null;
 const names=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const found=[...text.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gi)];
 const years=[...new Set(text.match(/\b(?:19|20)\d{2}\b/g)||[])];
 if(found.some(m=>/^\s+\d{1,2}\b/.test(text.slice(m.index!+m[0].length))) || found.length!==2 || years.length>1 || !Number.isInteger(year) || year<1900 || year>2100) return null;
 const selectedYear=years[0] || String(year);
 const months=[...new Set(found.map(m=>`${selectedYear}-${String(names.indexOf(m[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}`))];
 return months.length===2 ? months : null;
}
