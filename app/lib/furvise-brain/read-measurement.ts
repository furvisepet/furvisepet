import {measurementCandidates,type MeasurementCandidate} from "./measurement-candidates.ts";
import {units} from "./calculation-units.ts";
import {textMatchesReadPredicate} from "./read-text.ts";
import type {ReadPredicate,ReadTicket} from "./read-ticket.ts";
/** Explicit numeric membership only; units never certify an entity/attribute or clinical truth. */
export function eligibleMeasurements(body:string,unit:string,predicates:readonly ReadPredicate[],indexes:readonly number[]=[]):MeasurementCandidate[]{
 if(!units[unit])throw Error("measurement_eligibility_unit");
 const candidates=measurementCandidates(body,units[unit].dimension);
 return indexes.length?candidates.filter(c=>indexes.every(i=>{const p=predicates[i];return p?.kind==="text_any"&&textMatchesReadPredicate(c.context,p);})):candidates;
}
export function recordedOperandCandidates(body:string,unit:string,ticket:ReadTicket){
 const constraints=ticket.predicates.filter(p=>p.kind==="measurement"&&units[p.unit]?.dimension===units[unit]?.dimension);
 return measurementCandidates(body,units[unit].dimension).filter(c=>constraints.every(p=>p.kind==="measurement"&&eligibleMeasurements(body,p.unit,ticket.predicates,p.predicateIndexes).some(m=>m.sourceSpan.start===c.sourceSpan.start&&m.sourceSpan.end===c.sourceSpan.end)));
}
export function matchesReadPredicates(row:{id?:string;title?:string|null;note?:string|null},predicates:readonly ReadPredicate[]):boolean{
 const text=(row.title||"")+" "+(row.note||"");
 if(!predicates.filter(p=>p.kind==="text_any").every(p=>textMatchesReadPredicate(text,p)))return false;
 const body=row.note??row.title??"";
 return predicates.every(p=>{
  if(p.kind==="text_any")return true;
  if(p.kind==="source_ref")return typeof row.id==="string"&&p.sources.some(r=>r.sourceId==="care:"+row.id);
  const matches=eligibleMeasurements(body,p.unit,predicates,p.predicateIndexes);
  if(matches.length>1)throw Error("measurement_eligibility_ambiguous");
  if(!matches.length)return false;
  void matches[0].exact;void matches[0].value;return true;
 });
}
