import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { CareEntryRow } from "../supabase.ts";
import { buildLabsList, readLabsSnapshotMatches, carryReadLabsSnapshot, type LabsList } from "./labs-list.ts";
import { rebindCalculatePlan, type CalculatePlan } from "../furvise-brain/calculate-plan.ts";
import { executeCalculatePlan, type CalculateExecution } from "../furvise-brain/muscle.ts";
import { labsPresentation, type LabsPresentation } from "./labs-presentation.ts";

export const CALCULATION_LABS="server-calculation-labs";
export const CALCULATION_UNAVAILABLE="server-calculation-unavailable";
export const CALCULATION_LIMITATION="The requested calculation cannot be published from certified saved records in the requested format. This does not establish that measurements or records are absent.";
export type CalculationLabs={readLabs:LabsList;calculatePlan:CalculatePlan;execution:CalculateExecution;
 presentation:LabsPresentation;petNames:Record<string,string>};
const snapshots=new WeakMap<CalculationLabs,string>();
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function calculationRequestValid(e:AskEvidenceContract|undefined):boolean{
 const r=e?.interpretation?.request;
 if(!e||!r?.calculatePlan||!r.readTicket||r.mode!=="read"||r.evidenceBasis!=="saved_history"
  ||!e.scope.readOnlyRecall||e.scope.status!=="resolved"||r.profileFields?.length||r.evidenceNeeds?.length
  ||r.writeJob||r.appendJob||r.removeJob||r.fieldMutationJob||r.stateTransitionJob||r.lifecyclePlan
  ||r.mutationIntent||r.task||r.storedRead||r.projection||r.recordSelection
  ||r.readTicket.subjects.petIds.some(id=>!e.scope.authorizedPetIds.includes(id)))return false;
 try{return same(r.calculatePlan,rebindCalculatePlan(r.calculatePlan,r.readTicket));}catch{return false;}
}
export function buildCalculationLabs(e:AskEvidenceContract|undefined,rows:CareEntryRow[]):CalculationLabs|null{
 if(!calculationRequestValid(e))return null;
 const presentation=labsPresentation(e!.interpretation!.request!.outputFormat);
 if(!presentation)return null;
 let readLabs:LabsList|null;
 try{readLabs=buildLabsList(e,rows,true);}catch{return null;}
 if(!readLabs)return null;
 const calculatePlan=e!.interpretation!.request!.calculatePlan!;
 const execution=executeCalculatePlan(calculatePlan,readLabs);
 if(!execution.complete)return null;
 const labs={readLabs,calculatePlan:structuredClone(calculatePlan),execution,presentation,
  petNames:Object.fromEntries(readLabs.ticket.subjects.petIds.map(id=>[id,e!.petNames?.[id]||"this pet"]))};
 snapshots.set(labs,JSON.stringify(labs));return labs;
}
export function calculationSourceIds(labs:CalculationLabs):string[]{
 return [...new Set(labs.execution.results.flatMap(r=>r.status==="certified"?r.sourceIds:[]))];
}
const labels:Record<string,string>={sum:"Sum",mean:"Mean",difference:"Difference (input 0 minus input 1)",
 absolute_difference:"Absolute difference",ratio:"Ratio (input 1 / input 0)",percent_change:"Percent change (baseline 0 to input 1)",
 percent_of_sum:"Input 0 as a percentage of the sum",convert:"Converted measurement",
 elapsed_days:"Elapsed time between selected events",count_records:"Matching effective record count"};
export function serializeCalculationLabs(labs:CalculationLabs):string{
 const rows=labs.execution.results.map(r=>{
  if(r.status!=="certified")throw Error("CALCULATION_NOT_CERTIFIED");
  const value=r.precision===null?String(r.value):r.value.toFixed(r.precision);
  const result=value+(r.unit==="scalar"?"":" "+r.unit);
  const names=r.subjectIds.map(id=>labs.petNames[id]).join(", ");
  const operands=r.operands.map((o,i)=>"input "+i+": "+labs.petNames[o.subjectId]+"; "+
   (o.dimension==="instant"?o.eventAt:o.literal+"; event "+o.eventAt)).join("; ");
  return {label:labels[r.operator]+" for "+names,result,operands};
 });
 const cell=(s:string)=>s.replaceAll("|","\\|").replace(/[\r\n]/g," ");
 if(labs.presentation==="table")return ["| Calculation | Result | Certified inputs |","| --- | --- | --- |",
  ...rows.map(r=>"| "+cell(r.label)+" | "+cell(r.result)+" | "+cell(r.operands)+" |")].join("\n");
 return rows.map(r=>(labs.presentation==="list"?"- ":"")+r.label+": "+r.result+"."+(r.operands?" "+r.operands+".":"")).join(labs.presentation==="list"?"\n":"\n\n");
}
const empty=(v:unknown)=>Array.isArray(v)&&v.length===0;
function noOtherAuthority(r:AskReasoningResult){
 return !r.labsList&&!r.profileFieldLabs&&!r.historyNarrative&&!r.historicalResult&&!r.historySynthesis?.length
  &&[r.applicationActions,r.careActions,r.semanticEvents,r.learnings,r.referencedRecords,r.suggestedFollowUps].every(empty)
  &&!!r.proposedHistoryUpdate&&Object.entries(r.proposedHistoryUpdate).every(([k,v])=>k==="shouldOffer"?v===false:v===null);
}
export function calculationPublicationFailure(r:AskReasoningResult):string|null{
 const e=r.evidenceContract;
 if(!calculationRequestValid(e)||!noOtherAuthority(r)||r.answer.title!=="Furvise"||r.answer.sections.length||r.answer.safetyNote)return "calculation_contract";
 if(r.model===CALCULATION_UNAVAILABLE){
  return !r.calculationLabs&&r.answer.summary===CALCULATION_LIMITATION&&empty(r.relevantContextIds)
   &&!(e!.answerSourceIds?.length||e!.answerContent?.length)?null:"calculation_limitation_changed";
 }
 const labs=r.calculationLabs;
 if(r.model!==CALCULATION_LABS||!labs||snapshots.get(labs)!==JSON.stringify(labs)
  ||!readLabsSnapshotMatches(labs.readLabs)||!same(labs.calculatePlan,e!.interpretation!.request!.calculatePlan)
  ||!same(labs.readLabs.ticket,e!.interpretation!.request!.readTicket)
  ||!same(labs.readLabs.coverage,e!.history?.ticketCoverage)
  ||labs.presentation!==labsPresentation(e!.interpretation!.request!.outputFormat)
  ||Object.entries(labs.petNames).some(([id,name])=>name!==(e!.petNames?.[id]||"this pet"))
  ||!labs.execution.complete||!same(labs.execution,executeCalculatePlan(labs.calculatePlan,labs.readLabs))
  ||r.answer.summary!==serializeCalculationLabs(labs)||!same(r.relevantContextIds,calculationSourceIds(labs))
  ||e!.answerSourceIds&& !same(e!.answerSourceIds,calculationSourceIds(labs))
  ||e!.answerContent?.length)return "calculation_snapshot_changed";
 return null;
}
export function carryCalculationLabs(source:AskReasoningResult,target:AskReasoningResult){
 if(calculationPublicationFailure(source))throw Error("CALCULATION_CLONE_CHANGED");
 if(source.calculationLabs&&target.calculationLabs){
  if(!same(source.calculationLabs,target.calculationLabs))throw Error("CALCULATION_CLONE_CHANGED");
  carryReadLabsSnapshot(source.calculationLabs.readLabs,target.calculationLabs.readLabs);
  snapshots.set(target.calculationLabs,JSON.stringify(target.calculationLabs));
 }
}
