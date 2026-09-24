import type {CalculatePlan} from "./calculate-plan.ts";
import type {CalculationResult} from "./muscle.ts";
import {compare,rational,type Exact} from "./calculation-rational.ts";
export type ResultSelectionCertificate={
 status:"certified";plan:CalculatePlan;subjectIds:string[];candidateIds:string[];
 candidates:Array<{calculationId:string;subjectId:string;exact:Exact;unit:string;sourceIds:string[]}>;
 filterSurvivors:string[];groups:Array<{rank:number|null;exact:Exact;calculationIds:string[]}>;
 takeBoundary:Exact|null;selectedCalculationIds:string[];sourceIds:string[];complete:true;
}|{status:"limited";reason:string;complete:false};
/** Called by Muscle after arithmetic. No record access, source lookup or language
 * interpretation. FILTER -> ORDER -> TAKE; competition ranks skip tied places. */
export function selectCalculationResults(plan:CalculatePlan,results:readonly CalculationResult[]):ResultSelectionCertificate|null{
 const selection=plan.resultSelection;if(!selection)return null;
 const limited=():ResultSelectionCertificate=>({status:"limited",reason:"candidate_cohort_not_certified",complete:false});
 if(results.length!==plan.calculations.length||results.some(r=>r.status!=="certified"))return limited();
 const candidates=plan.calculations.map(c=>{
  const matches=results.filter(r=>r.id===c.id);if(matches.length!==1||matches[0].status!=="certified")return null;
  const r=matches[0],subjectId=c.operands[0]&&"subjectId" in c.operands[0]?c.operands[0].subjectId:null;
  if(!subjectId||r.subjectIds.length!==1||r.subjectIds[0]!==subjectId||r.unit!==c.resultUnit)return null;
  return {calculationId:r.id,subjectId,exact:r.exact,unit:r.unit,sourceIds:[...r.sourceIds]};
 });
 if(candidates.some(c=>!c))return limited();
 const all=candidates.filter(c=>c!==null),threshold=selection.filter?rational(selection.filter.threshold.exact):null;
 const survivors=all.filter(c=>{
  if(!selection.filter||!threshold)return true;
  const cmp=compare(rational(c.exact),threshold);
  switch(selection.filter.comparator){case"gt":return cmp>0;case"gte":return cmp>=0;case"lt":return cmp<0;case"lte":return cmp<=0;case"eq":return cmp===0;}
 });
 // ID ordering stabilizes presentation only; equality and cutoff membership use
 // rational groups, never this secondary key.
 const stable=(a:typeof all[number],b:typeof all[number])=>a.subjectId<b.subjectId?-1:a.subjectId>b.subjectId?1:0;
 survivors.sort((a,b)=>selection.orderBy?(selection.orderBy.direction==="desc"?-1:1)*compare(rational(a.exact),rational(b.exact))||stable(a,b):stable(a,b));
 const groups:Extract<ResultSelectionCertificate,{status:"certified"}>["groups"]=[];
 for(let i=0;i<survivors.length;i++){
  const c=survivors[i],last=groups.at(-1);
  if(selection.orderBy&&last&&compare(rational(last.exact),rational(c.exact))===0)last.calculationIds.push(c.calculationId);
  else groups.push({rank:selection.orderBy?i+1:null,exact:c.exact,calculationIds:[c.calculationId]});
 }
 const cutoff=selection.take&&survivors.length?survivors[Math.min(selection.take.count,survivors.length)-1].exact:null;
 const chosen=selection.take?groups.filter(g=>g.rank!==null&&g.rank<=selection.take!.count):groups;
 return {status:"certified",plan,subjectIds:all.map(c=>c.subjectId),candidateIds:all.map(c=>c.calculationId),candidates:all,
  filterSurvivors:survivors.map(c=>c.calculationId),groups,takeBoundary:cutoff,
  selectedCalculationIds:chosen.flatMap(g=>g.calculationIds),sourceIds:[...new Set(all.flatMap(c=>c.sourceIds))],complete:true};
}
