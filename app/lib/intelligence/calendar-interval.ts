/** Resolve only two explicitly named calendar dates in an elapsed-day question. */
export function requestedCalendarInterval(question: string, year: number) {
 if (!/\bhow many days\s+(?:are there|passed|elapsed|between|from|apart|separate)\b/i.test(question)) return null;
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const matches=[...question.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/gi)];
 if(matches.length!==2 || !Number.isInteger(year) || year<1900 || year>2100) return null;
 const days=matches.map(m=>`${m[3] || year}-${String(months.indexOf(m[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`);
 if(days.some(d=>!Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10)!==d)) return null;
 const elapsed=(Date.parse(days[1])-Date.parse(days[0]))/86400000;
 if(elapsed<0 || !Number.isInteger(elapsed)) return null;
 return {from:days[0],last:days[1],to:new Date(Date.parse(days[1])+86400000).toISOString().slice(0,10),days:elapsed};
}

import type { AskEvidenceContract } from './ask-evidence.ts';
export function calendarIntervalAnswer(contract: AskEvidenceContract): string | null {
 const start=contract.interpretation?.history?.from;
 if(!start || !contract.history || contract.scope.status!=='resolved' || !contract.scope.readOnlyRecall
   || contract.scope.authorizedPetIds.length!==1 || contract.history.corrections==='unavailable') return null;
 const interval=requestedCalendarInterval(contract.scope.requestText,Number(start.slice(0,4)));
 if(!interval || start.slice(0,10)!==interval.from) return null;
 const petId=contract.scope.authorizedPetIds[0];
 const endpoints=[interval.from,interval.last].map(day=>contract.represented.find(span=>
  span.petId===petId && span.sourceType==='care_update' && span.occurredAt?.slice(0,10)===day
  && span.start===0 && span.end===span.text.length && !contract.losses.some(loss=>loss.sourceId===span.sourceId)
  && contract.sources.some(source=>source.petId===petId && source.status==='loaded' && source.loadedIds.includes(span.sourceId))
  && contract.history?.provenance.some(p=>p.sourceId===span.sourceId && ['effective_linked','effective_replacement','unverified_legacy'].includes(p.status))));
 if(endpoints.some(span=>!span)) return null;
 contract.answerSourceIds=endpoints.map(span=>span!.sourceId);
 return `There are ${interval.days} calendar days from ${interval.from} to ${interval.last}. This is the interval between those dates, not a measure of how long symptoms lasted.`;
}
