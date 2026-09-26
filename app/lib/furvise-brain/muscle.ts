import { measurementCandidates, type SourceSpan } from "./measurement-candidates.ts";
import { textMatchesReadPredicate } from "./read-text.ts";
import {selectCalculationResults,type ResultSelectionCertificate} from "./calculation-result-selection.ts";
import { rebindCalculatePlan, isResultOperand, isPremiseOperand, type CalculatePlan, type CalculateSlot, type CalculateRole } from "./calculate-plan.ts";
import { units } from "./calculation-units.ts";
import { readLabsSnapshotMatches, type LabsList } from "../intelligence/labs-list.ts";
import { selectionPublication } from "../intelligence/selection-publication.ts";
import { resultSetSnapshotMatches } from "../intelligence/result-set-publication.ts";

import {fraction,add,neg,mul,div,factor,finite,rational,exact,type Exact,type Fraction} from "./calculation-rational.ts";
export type CalculationOperand={
 slot:CalculateSlot; sourceId:string; recordId:string; subjectId:string; eventAt:string;
 literal:string; value:number; unit:string; dimension:string; body:string;
 sourceSpan:SourceSpan|null; contextSpan:SourceSpan|null; numericText:string|null; measurementExact:Exact|null; measurementSelector:CalculateSlot["measurementSelector"];
};
export type CalculationDependency={role:CalculateRole;calculationId:string;operator:string;unit:string;exact:Exact};
export type CalculationResult={id:string;status:"certified";operator:string;operands:CalculationOperand[];
 dependencyCalculationIds:string[];transitiveCalculationIds:string[];upstreamResults:CalculationDependency[];
 sourceIds:string[];subjectIds:string[];value:number;exact:{numerator:string;denominator:string};unit:string;precision:number|null}
 |{id:string;status:"limited";reason:string};
export type CalculateExecution={plan:CalculatePlan;results:CalculationResult[];resultSelection?:ResultSelectionCertificate|null;terminalCalculationIds?:string[];complete:boolean};

/** Only an unchanged server Labs transport can enter Muscle. Existing organ
 * receipts establish each semantic slot; neither array order nor text selects it.
 * All arithmetic is rational; precision affects presentation only. */
export function executeCalculatePlan(proposed:CalculatePlan,read:LabsList):CalculateExecution {
 const results:CalculationResult[]=[];
 const completed=new Map<string,{plan:CalculatePlan["calculations"][number];result:CalculationResult}>();
 const plan=rebindCalculatePlan(proposed,read.ticket);
 const snapshot=readLabsSnapshotMatches(read);
 const selected=selectionPublication(read.ticket,read.coverage,read.records);
 for(const c of plan.calculations){
  try {
   if(!snapshot)throw Error("read_snapshot_changed");
   let result:Fraction;const operands:CalculationOperand[]=[];
   let sourceIds:string[]=[],subjectIds:string[]=[],dependencyCalculationIds:string[]=[],transitiveCalculationIds:string[]=[];
   const upstreamResults:CalculationDependency[]=[];
   if(c.operator==="count_records"){
    const proof=read.coverage.resultSet;
    if(!proof?.certified||!proof.matchingSetComplete||!proof.representationComplete
     ||!["complete","complete_empty"].includes(read.coverage.status)
     ||!resultSetSnapshotMatches(read.ticket,read.coverage,read.records))throw Error("result_set_not_certified");
    result=fraction(BigInt(proof.matchingIds.length));sourceIds=read.records.map(r=>r.sourceId);subjectIds=[...read.ticket.subjects.petIds];
   }else{
    const values:{role:CalculateRole;value:Fraction}[]=[];
    const derived=c.operands.some(isResultOperand);
    if(derived){
     for(const operand of c.operands){
      if(!isResultOperand(operand))throw Error("mixed_operands");
      // Only this invocation can populate completed. External/serialized results
      // never enter the dependency resolver.
      const upstream=completed.get(operand.calculationId),r=upstream?.result;
      if(!upstream||!r||r.status!=="certified")throw Error("dependency_not_certified");
      if(r.id!==operand.calculationId||r.id!==upstream.plan.id||r.operator!==upstream.plan.operator
       ||r.unit!==upstream.plan.resultUnit||r.operator==="count_records")throw Error("dependency_binding");
      const q=rational(r.exact);finite(q);values.push({role:operand.role,value:q});
      upstreamResults.push({role:operand.role,calculationId:r.id,operator:r.operator,unit:r.unit,exact:{...r.exact}});
      dependencyCalculationIds.push(r.id);transitiveCalculationIds.push(...r.transitiveCalculationIds,r.id);
      sourceIds.push(...r.sourceIds);subjectIds.push(...r.subjectIds);
     }
     dependencyCalculationIds=[...new Set(dependencyCalculationIds)];
     transitiveCalculationIds=[...new Set(transitiveCalculationIds)];
     sourceIds=[...new Set(sourceIds)];subjectIds=[...new Set(subjectIds)];
    }else{
     if(!selected?.transportValid)throw Error("selection_transport");
     for(const slot of c.operands){
      if(isResultOperand(slot))throw Error("mixed_operands");
      if(isPremiseOperand(slot))throw Error("premise_execution_unavailable");
      const certificate=selected.certificates.find(p=>p.subjectId===slot.subjectId&&p.clauseId===slot.clause);
      if(!certificate?.certified||!certificate.lineageClosed)throw Error("slot_not_certified");
      const id=certificate.selectedEventIds[slot.item];
      const rows=read.records.filter(r=>r.id===id&&r.petId===slot.subjectId);
      if(!id||rows.length!==1)throw Error("slot_missing");
      const row=rows[0];let literal:string,value:number,unit:string,dimension:string,q:Fraction;
      let sourceSpan:SourceSpan|null=null,contextSpan:SourceSpan|null=null,numericText:string|null=null,measurementExact:Exact|null=null;
      if(slot.field==="event_at"){
       literal=row.event_at;value=Date.parse(literal);if(!Number.isFinite(value))throw Error("event_time");
       unit="instant";dimension="instant";q=fraction(BigInt(value));
      }else{
       const required=units[slot.unit!];
       const candidates=measurementCandidates(row.body,required.dimension);
       const selector=slot.measurementSelector;
       const tokens=selector?candidates.filter(candidate=>selector.predicateIndexes.every(index=>
        textMatchesReadPredicate(candidate.context,read.ticket.predicates[index]))):candidates;
       if(tokens.length!==1)throw Error(selector
        ?tokens.length?"measurement_selector_ambiguous":"measurement_selector_no_match"
        :tokens.length?"ambiguous_measurement":"measurement_unavailable");
       const token=tokens[0];literal=token.literal;unit=token.unit;dimension=token.dimension;
       sourceSpan=token.sourceSpan;contextSpan=token.contextSpan;numericText=token.numericText;
       const raw=token.exact;measurementExact=exact(raw);
       value=finite(raw);q=mul(raw,factor(token.sourceUnit));finite(q);
      }
      values.push({role:slot.role,value:q});operands.push({slot,sourceId:row.sourceId,recordId:row.id,subjectId:row.petId,eventAt:row.event_at,literal,value,unit,dimension,body:row.body,sourceSpan,contextSpan,numericText,measurementExact,measurementSelector:slot.measurementSelector??null});
     }
    }
    const valueFor=(role:CalculateRole):Fraction=>{
     const matches=values.filter(v=>v.role===role);
     if(matches.length!==1)throw Error("operand_role_cardinality");
     return matches[0].value;
    };
    const members=values.filter(v=>v.role==="member").map(v=>v.value);
    const sum=members.reduce(add,fraction(BigInt(0)));
    switch(c.operator){
     case "sum":result=sum;break;
     case "mean":result=div(sum,fraction(BigInt(members.length)));break;
     case "difference":result=add(valueFor("target"),neg(valueFor("reference")));break;
     case "absolute_difference":{const d=add(members[0],neg(members[1]));result=fraction(d.n<BigInt(0)?-d.n:d.n,d.d);break;}
     case "ratio":result=div(valueFor("target"),valueFor("reference"));break;
     case "percent_change":result=mul(div(add(valueFor("target"),neg(valueFor("reference"))),valueFor("reference")),fraction(BigInt(100)));break;
     case "percent_of_sum":result=mul(div(valueFor("part"),add(valueFor("part"),sum)),fraction(BigInt(100)));break;
     case "elapsed_days":result=div(add(valueFor("end"),neg(valueFor("start"))),fraction(BigInt(86400000)));break;
     case "convert":result=valueFor("source");break;
     default:throw Error("operator");
    }
    if(derived){
     if(c.operator==="convert")result=div(mul(result,factor(upstreamResults.find(r=>r.role==="source")!.unit)),factor(c.resultUnit));
    }else{
     if(["sum","mean","difference","absolute_difference","convert"].includes(c.operator))result=div(result,factor(c.resultUnit));
     sourceIds=[...new Set(operands.map(o=>o.sourceId))];subjectIds=[...new Set(operands.map(o=>o.subjectId))];
    }
   }
   results.push({id:c.id,status:"certified",operator:c.operator,operands,dependencyCalculationIds,transitiveCalculationIds,upstreamResults,sourceIds,subjectIds,value:finite(result),
    exact:{numerator:String(result.n),denominator:String(result.d)},unit:c.resultUnit,precision:c.precision});
  }catch(e){results.push({id:c.id,status:"limited",reason:e instanceof Error?e.message:"calculation_unavailable"});}
  completed.set(c.id,{plan:c,result:results[results.length-1]});
 }
 const referenced=new Set(plan.calculations.flatMap(c=>c.operands.filter(isResultOperand).map(o=>o.calculationId)));
 const terminalCalculationIds=referenced.size?plan.calculations.filter(c=>!referenced.has(c.id)).map(c=>c.id):undefined;
 const resultSelection=selectCalculationResults(plan,results);
 return {plan,results,...(terminalCalculationIds?{terminalCalculationIds}:{}),...(plan.resultSelection?{resultSelection}:{}),complete:results.every(r=>r.status==="certified")&&(!resultSelection||resultSelection.complete)};
}
