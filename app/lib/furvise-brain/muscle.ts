import {selectCalculationResults,type ResultSelectionCertificate} from "./calculation-result-selection.ts";
import { rebindCalculatePlan, type CalculatePlan, type CalculateSlot } from "./calculate-plan.ts";
import { units } from "./calculation-units.ts";
import { readLabsSnapshotMatches, type LabsList } from "../intelligence/labs-list.ts";
import { selectionPublication } from "../intelligence/selection-publication.ts";
import { resultSetSnapshotMatches } from "../intelligence/result-set-publication.ts";

import {fraction,decimal,add,neg,mul,div,factor,finite,type Fraction} from "./calculation-rational.ts";
export type CalculationOperand={
 slot:CalculateSlot; sourceId:string; recordId:string; subjectId:string; eventAt:string;
 literal:string; value:number; unit:string; dimension:string; body:string;
};
export type CalculationResult={id:string;status:"certified";operator:string;operands:CalculationOperand[];
 sourceIds:string[];subjectIds:string[];value:number;exact:{numerator:string;denominator:string};unit:string;precision:number|null}
 |{id:string;status:"limited";reason:string};
export type CalculateExecution={plan:CalculatePlan;results:CalculationResult[];resultSelection?:ResultSelectionCertificate|null;complete:boolean};

/** Only an unchanged server Labs transport can enter Muscle. Existing organ
 * receipts establish each semantic slot; neither array order nor text selects it.
 * All arithmetic is rational; precision affects presentation only. */
export function executeCalculatePlan(proposed:CalculatePlan,read:LabsList):CalculateExecution {
 const results:CalculationResult[]=[];
 const plan=rebindCalculatePlan(proposed,read.ticket);
 const snapshot=readLabsSnapshotMatches(read);
 const selected=selectionPublication(read.ticket,read.coverage,read.records);
 for(const c of plan.calculations){
  try {
   if(!snapshot)throw Error("read_snapshot_changed");
   let result:Fraction;const operands:CalculationOperand[]=[];
   let sourceIds:string[]=[],subjectIds:string[]=[];
   if(c.operator==="count_records"){
    const proof=read.coverage.resultSet;
    if(!proof?.certified||!proof.matchingSetComplete||!proof.representationComplete
     ||!["complete","complete_empty"].includes(read.coverage.status)
     ||!resultSetSnapshotMatches(read.ticket,read.coverage,read.records))throw Error("result_set_not_certified");
    result=fraction(BigInt(proof.matchingIds.length));sourceIds=read.records.map(r=>r.sourceId);subjectIds=[...read.ticket.subjects.petIds];
   }else{
    const values:Fraction[]=[];
    if(!selected?.transportValid)throw Error("selection_transport");
    for(const slot of c.operands){
     const certificate=selected.certificates.find(p=>p.subjectId===slot.subjectId&&p.clauseId===slot.clause);
     if(!certificate?.certified||!certificate.lineageClosed)throw Error("slot_not_certified");
     const id=certificate.selectedEventIds[slot.item];
     const rows=read.records.filter(r=>r.id===id&&r.petId===slot.subjectId);
     if(!id||rows.length!==1)throw Error("slot_missing");
     const row=rows[0];let literal:string,value:number,unit:string,dimension:string,q:Fraction;
     if(slot.field==="event_at"){
      literal=row.event_at;value=Date.parse(literal);if(!Number.isFinite(value))throw Error("event_time");
      unit="instant";dimension="instant";q=fraction(BigInt(value));
     }else{
      const required=units[slot.unit!];
      const tokens=[...row.body.matchAll(/(?<![\p{L}\p{N}_.,/+\u2212-])([+\u2212-]?\d+(?:\.\d+)?)\s*([A-Za-z]+)(?![\p{L}\p{N}_/])/gu)]
       .filter(m=>Object.hasOwn(units,m[2].toLowerCase())&&units[m[2].toLowerCase()].dimension===required.dimension);
      if(tokens.length!==1)throw Error(tokens.length?"ambiguous_measurement":"measurement_unavailable");
      const token=tokens[0];literal=token[0];unit=units[token[2].toLowerCase()].canonical;dimension=required.dimension;
      const numeric=token[1].replace("\u2212","-");const raw=decimal(numeric);value=finite(raw);q=mul(raw,factor(token[2].toLowerCase()));finite(q);
     }
     values.push(q);operands.push({slot,sourceId:row.sourceId,recordId:row.id,subjectId:row.petId,eventAt:row.event_at,literal,value,unit,dimension,body:row.body});
    }
    const sum=values.reduce(add,fraction(BigInt(0)));
    switch(c.operator){
     case "sum":result=sum;break;
     case "mean":result=div(sum,fraction(BigInt(values.length)));break;
     case "difference":result=add(values[0],neg(values[1]));break;
     case "absolute_difference":{const d=add(values[0],neg(values[1]));result=fraction(d.n<BigInt(0)?-d.n:d.n,d.d);break;}
     case "ratio":result=div(values[1],values[0]);break;
     case "percent_change":result=mul(div(add(values[1],neg(values[0])),values[0]),fraction(BigInt(100)));break;
     case "percent_of_sum":result=mul(div(values[0],sum),fraction(BigInt(100)));break;
     case "elapsed_days":result=div(add(values[1],neg(values[0])),fraction(BigInt(86400000)));break;
     case "convert":result=values[0];break;
     default:throw Error("operator");
    }
    if(["sum","mean","difference","absolute_difference","convert"].includes(c.operator))result=div(result,factor(c.resultUnit));
    sourceIds=[...new Set(operands.map(o=>o.sourceId))];subjectIds=[...new Set(operands.map(o=>o.subjectId))];
   }
   results.push({id:c.id,status:"certified",operator:c.operator,operands,sourceIds,subjectIds,value:finite(result),
    exact:{numerator:String(result.n),denominator:String(result.d)},unit:c.resultUnit,precision:c.precision});
  }catch(e){results.push({id:c.id,status:"limited",reason:e instanceof Error?e.message:"calculation_unavailable"});}
 }
 const resultSelection=selectCalculationResults(plan,results);
 return {plan,results,...(plan.resultSelection?{resultSelection}:{}),complete:results.every(r=>r.status==="certified")&&(!resultSelection||resultSelection.complete)};
}
