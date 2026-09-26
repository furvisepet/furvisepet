import { calculationCapability, CALCULATION_CAPABILITY_LIMITATION, CALCULATION_CAPABILITY_UNSUPPORTED } from "./calculation-capability.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { CareEntryRow } from "../supabase.ts";
import { buildLabsList, readLabsSnapshotMatches, carryReadLabsSnapshot, type LabsList } from "./labs-list.ts";
import { rebindCalculatePlan, carryCalculatePlan, type CalculatePlan } from "../furvise-brain/calculate-plan.ts";
import { executeCalculatePlan, type CalculateExecution } from "../furvise-brain/muscle.ts";
import { labsPresentation, type LabsPresentation } from "./labs-presentation.ts";

export const CALCULATION_LABS="server-calculation-labs";
export const CALCULATION_UNAVAILABLE="server-calculation-unavailable";
export const CALCULATION_LIMITATION="I couldn't verify the typed inputs needed for that calculation.";
export type CalculationSourceDomain="saved_history"|"supplied_context";
export type CalculationLabs={sourceDomain:CalculationSourceDomain;readLabs:LabsList|null;calculatePlan:CalculatePlan;execution:CalculateExecution;
 presentation:LabsPresentation;petNames:Record<string,string>};
const snapshots=new WeakMap<CalculationLabs,string>();
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

function lifecycleMutates(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const plan=value as Record<string,unknown>;
 return plan.pendingDisposition==="cancel"||plan.transition!==null&&plan.transition!==undefined;
}
export function calculationSourceDomain(e:AskEvidenceContract|undefined):CalculationSourceDomain|null{
 const r=e?.interpretation?.request;
 if(!e||!r?.calculatePlan||r.mode!=="read"||!e.scope.readOnlyRecall||e.scope.status!=="resolved"
  ||r.profileFields?.length||r.evidenceNeeds?.length||r.writeJob||r.appendJob||r.removeJob||r.fieldMutationJob||r.stateTransitionJob
  ||lifecycleMutates(r.lifecyclePlan)||r.mutationIntent||r.task||r.storedRead||r.projection||r.recordSelection)return null;
 if(r.evidenceBasis==="saved_history"&&r.readTicket
  &&r.readTicket.subjects.petIds.every(id=>e.scope.authorizedPetIds.includes(id)))return "saved_history";
 if(r.evidenceBasis==="supplied_context"&&!r.readTicket)return "supplied_context";
 return null;
}
export function calculationRequestValid(e:AskEvidenceContract|undefined):boolean{
 const domain=calculationSourceDomain(e),r=e?.interpretation?.request;
 if(!domain||!r?.calculatePlan)return false;
 try{return same(r.calculatePlan,rebindCalculatePlan(r.calculatePlan,r.readTicket??null));}catch{return false;}
}
export function calculationLimitationReason(e:AskEvidenceContract|undefined):string {
 const r=e?.interpretation?.request;
 return r?.calculatePlan&&!calculationCapability(r.calculatePlan,r.readTicket??null).supported
  ? CALCULATION_CAPABILITY_UNSUPPORTED : "calculation_unavailable";
}
export function calculationLimitation(e:AskEvidenceContract|undefined):string {
 return calculationLimitationReason(e)===CALCULATION_CAPABILITY_UNSUPPORTED?CALCULATION_CAPABILITY_LIMITATION:CALCULATION_LIMITATION;
}
export function buildCalculationLabs(e:AskEvidenceContract|undefined,rows:CareEntryRow[]):CalculationLabs|null{
 const sourceDomain=calculationSourceDomain(e),r=e?.interpretation?.request;
 if(!sourceDomain||!r?.calculatePlan||!calculationRequestValid(e))return null;
 if(!calculationCapability(r.calculatePlan,r.readTicket??null).supported)return null;
 const presentation=labsPresentation(r.outputFormat);
 if(!presentation)return null;
 let readLabs:LabsList|null=null;
 if(sourceDomain==="saved_history"){
  try{readLabs=buildLabsList(e,rows,true);}catch{return null;}
  if(!readLabs)return null;
 }
 const calculatePlan=r.calculatePlan;
 const execution=executeCalculatePlan(calculatePlan,readLabs);
 if(!execution.complete)return null;
 const rebound=rebindCalculatePlan(calculatePlan,readLabs?.ticket??null);
 const petNames=readLabs
  ?Object.fromEntries(readLabs.ticket.subjects.petIds.map(id=>[id,e!.petNames?.[id]||"this pet"]))
  :{};
 const labs:CalculationLabs={sourceDomain,readLabs,calculatePlan:rebound,execution,presentation,petNames};
 snapshots.set(labs,JSON.stringify(labs));return labs;
}
export function calculationSourceIds(labs:CalculationLabs):string[]{
 return [...new Set(labs.execution.results.flatMap(r=>r.status==="certified"?r.sourceIds:[]))];
}
const labels:Record<string,string>={sum:"Sum",mean:"Mean",difference:"Difference",
 absolute_difference:"Absolute difference",ratio:"Ratio",percent_change:"Percent change",
 percent_of_sum:"Part as a percentage of the sum",convert:"Converted measurement",
 elapsed_days:"Elapsed time between selected events",count_records:"Matching effective record count"};
export function serializeCalculationLabs(labs:CalculationLabs):string{
 const certificate=labs.execution.resultSelection;
 if(certificate&&certificate.status!=="certified")throw Error("CALCULATION_SELECTION_NOT_CERTIFIED");
 const visibleIds=certificate?.selectedCalculationIds??labs.execution.terminalCalculationIds;
 const selected=visibleIds?visibleIds.map(id=>labs.execution.results.find(r=>r.id===id)!):labs.execution.results;
 if(certificate&&!selected.length)return "No calculated subject results met the requested threshold.";
 const rows=selected.map(r=>{
  if(r.status!=="certified")throw Error("CALCULATION_NOT_CERTIFIED");
  const value=r.precision===null?String(r.value):r.value.toFixed(r.precision);
  const result=value+(r.unit==="scalar"?"":" "+r.unit);
  const names=r.subjectIds.map(id=>labs.petNames[id]).filter(Boolean).join(", ");
  const roleLabel=(role:string)=>role[0].toUpperCase()+role.slice(1);
  const inputs=r.upstreamResults.length
   ?r.upstreamResults.map(o=>roleLabel(o.role)+": certified calculation input ("+o.unit+")").join("; ")
   :r.premiseInputs?.length
    ?r.premiseInputs.map(o=>roleLabel(o.role)+": "+JSON.stringify(o.literal)).join("; ")
    :r.operands.map(o=>roleLabel(o.slot.role)+": "+labs.petNames[o.subjectId]+"; "+
      (o.dimension==="instant"?o.eventAt:o.literal+"; event "+o.eventAt)).join("; ");
  const group=certificate?.groups.find(g=>g.calculationIds.includes(r.id));
  const rank=group?.rank;
  const prefix=rank!==null&&rank!==undefined?"Rank "+rank+(group!.calculationIds.length>1?" (tied)":"")+": ":"";
  return {label:prefix+labels[r.operator]+(names?" for "+names:""),result,operands:inputs};
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
 const e=r.evidenceContract,request=e?.interpretation?.request,domain=calculationSourceDomain(e);
 if(!domain||!request?.calculatePlan||!calculationRequestValid(e)||!noOtherAuthority(r)
  ||r.answer.title!=="Furvise"||r.answer.sections.length||r.answer.safetyNote)return "calculation_contract";
 if(r.model===CALCULATION_UNAVAILABLE){
  return !r.calculationLabs&&r.answer.summary===calculationLimitation(e)&&empty(r.relevantContextIds)
   &&!(e!.answerSourceIds?.length||e!.answerContent?.length)?null:"calculation_limitation_changed";
 }
 if(!calculationCapability(request.calculatePlan,request.readTicket??null).supported)return CALCULATION_CAPABILITY_UNSUPPORTED;
 const labs=r.calculationLabs;
 if(r.model!==CALCULATION_LABS||!labs||snapshots.get(labs)!==JSON.stringify(labs)
  ||labs.sourceDomain!==domain||!same(labs.calculatePlan,request.calculatePlan)
  ||labs.presentation!==labsPresentation(request.outputFormat)
  ||Object.entries(labs.petNames).some(([id,name])=>name!==(e!.petNames?.[id]||"this pet"))
  ||!labs.execution.complete||!same(labs.execution,executeCalculatePlan(labs.calculatePlan,labs.readLabs))
  ||r.answer.summary!==serializeCalculationLabs(labs)||!same(r.relevantContextIds,calculationSourceIds(labs))
  ||e!.answerSourceIds&& !same(e!.answerSourceIds,calculationSourceIds(labs))
  ||e!.answerContent?.length)return "calculation_snapshot_changed";
 if(domain==="saved_history"){
  if(!labs.readLabs||!readLabsSnapshotMatches(labs.readLabs)
   ||!same(labs.readLabs.ticket,request.readTicket)||!same(labs.readLabs.coverage,e!.history?.ticketCoverage))
   return "calculation_snapshot_changed";
 }else if(labs.readLabs!==null||request.readTicket!==null)return "calculation_snapshot_changed";
 return null;
}
export function carryCalculationLabs(source:AskReasoningResult,target:AskReasoningResult){
 if(calculationPublicationFailure(source))throw Error("CALCULATION_CLONE_CHANGED");
 const sourcePlan=source.evidenceContract?.interpretation?.request?.calculatePlan;
 const targetRequest=target.evidenceContract?.interpretation?.request;
 const targetPlan=targetRequest?.calculatePlan;
 if(sourcePlan&&targetPlan)carryCalculatePlan(sourcePlan,targetPlan,targetRequest?.readTicket??null);
 if(source.calculationLabs&&target.calculationLabs){
  if(!same(source.calculationLabs,target.calculationLabs))throw Error("CALCULATION_CLONE_CHANGED");
  if(Boolean(source.calculationLabs.readLabs)!==Boolean(target.calculationLabs.readLabs))throw Error("CALCULATION_CLONE_CHANGED");
  if(source.calculationLabs.readLabs&&target.calculationLabs.readLabs)
   carryReadLabsSnapshot(source.calculationLabs.readLabs,target.calculationLabs.readLabs);
  carryCalculatePlan(source.calculationLabs.calculatePlan,target.calculationLabs.calculatePlan,target.calculationLabs.readLabs?.ticket??null);
  snapshots.set(target.calculationLabs,JSON.stringify(target.calculationLabs));
 }
}
