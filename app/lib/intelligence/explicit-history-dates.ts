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
 const days=labels.map(m=>`${m[3]||year}-${String(months.indexOf(m[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`);
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
