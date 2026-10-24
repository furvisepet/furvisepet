import {observeCalculation,calculationErrorReason} from "./calculation-observation.mjs";
import { calculationCapability, CALCULATION_CAPABILITY_LIMITATION, CALCULATION_CAPABILITY_UNSUPPORTED } from "./calculation-capability.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { CareEntryRow } from "../supabase.ts";
import { buildLabsList, readLabsSnapshotMatches, carryReadLabsSnapshot, type LabsList } from "./labs-list.ts";
import { rebindCalculatePlan, carryCalculatePlan, type CalculatePlan, isRecordedOperand, isRecordedAnchorOperand } from "../furvise-brain/calculate-plan.ts";
import { executeCalculatePlan, type CalculateExecution, type RecordedCalculationContext } from "../furvise-brain/muscle.ts";
import {revalidateRecordedNumericPremise,recordedOperandPosition} from "./recorded-numeric-premise.ts";
import { selectionPublication } from "./selection-publication.ts";
import { labsPresentation, type LabsPresentation } from "./labs-presentation.ts";

export const CALCULATION_LABS="server-calculation-labs";
export const CALCULATION_UNAVAILABLE="server-calculation-unavailable";
export const CALCULATION_LIMITATION="The requested calculation cannot be published from certified saved records in the requested format. This does not establish that measurements or records are absent.";
export type CalculationLabs={readLabs:LabsList;calculatePlan:CalculatePlan;execution:CalculateExecution;
 presentation:LabsPresentation;petNames:Record<string,string>};
const snapshots=new WeakMap<CalculationLabs,string>();
const publicationReceipts=new WeakMap<CalculationLabs,{context:RecordedCalculationContext;bytes:string}>();
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
export function calculationLimitationReason(e:AskEvidenceContract|undefined):string {
 const r=e?.interpretation?.request;
 return r?.calculatePlan&&r.readTicket&&!calculationCapability(r.calculatePlan,r.readTicket).supported
  ? CALCULATION_CAPABILITY_UNSUPPORTED : "calculation_unavailable";
}
export function calculationLimitation(e:AskEvidenceContract|undefined):string {
 return calculationLimitationReason(e)===CALCULATION_CAPABILITY_UNSUPPORTED?CALCULATION_CAPABILITY_LIMITATION:CALCULATION_LIMITATION;
}
export function buildCalculationLabs(e:AskEvidenceContract|undefined,rows:CareEntryRow[]):CalculationLabs|null;
export function buildCalculationLabs(e:AskEvidenceContract|undefined,rows:CareEntryRow[],context:RecordedCalculationContext):Promise<CalculationLabs|null>;
export function buildCalculationLabs(e:AskEvidenceContract|undefined,rows:CareEntryRow[],context?:RecordedCalculationContext):CalculationLabs|null|Promise<CalculationLabs|null>{
 if(context)return buildRecordedCalculationLabs(e,rows,context);
 if(!calculationRequestValid(e))return null;
 if(!calculationCapability(e!.interpretation!.request!.calculatePlan!,e!.interpretation!.request!.readTicket!).supported)return null;
 const presentation=labsPresentation(e!.interpretation!.request!.outputFormat);
 if(!presentation)return null;
 let readLabs:LabsList|null;
 try{readLabs=buildLabsList(e,rows,true);}catch{return null;}
 if(!readLabs)return null;
 const calculatePlan=e!.interpretation!.request!.calculatePlan!;
 const execution=executeCalculatePlan(calculatePlan,readLabs);
 if(!execution.complete)return null;
 const labs={readLabs,calculatePlan:rebindCalculatePlan(calculatePlan,readLabs.ticket),execution,presentation,
  petNames:Object.fromEntries(readLabs.ticket.subjects.petIds.map(id=>[id,e!.petNames?.[id]||"this pet"]))};
 snapshots.set(labs,JSON.stringify(labs));return labs;
}
async function buildRecordedCalculationLabs(e:AskEvidenceContract|undefined,rows:CareEntryRow[],context:RecordedCalculationContext):Promise<CalculationLabs|null>{
 const plan=e?.interpretation?.request?.calculatePlan;
 observeCalculation("materialization","started",plan);
 try{
 context.assertCurrent?.();
 if(!calculationRequestValid(e)){observeCalculation("materialization","request_contract",plan);return null;}
 if(!calculationCapability(e!.interpretation!.request!.calculatePlan!,e!.interpretation!.request!.readTicket!,context.scope.userId).supported){observeCalculation("materialization","policy_disabled",plan);return null;}
 const presentation=labsPresentation(e!.interpretation!.request!.outputFormat);
 if(!presentation){observeCalculation("materialization","presentation_unsupported",plan);return null;}
 const readLabs=buildLabsList(e,rows,true),calculatePlan=e!.interpretation!.request!.calculatePlan!;
 if(!readLabs){observeCalculation("materialization","read_transport_unavailable",plan);return null;}
 if(!calculatePlan.calculations.every(c=>c.operands.every(isRecordedOperand))){observeCalculation("materialization","operand_variant_unsupported",plan);return null;}
 // An unresolved event anchor cannot authorize any recorded arithmetic operand.
 if(readLabs.coverage.status==="anchor_missing"){observeCalculation("materialization","anchor_missing",plan);return null;}
 // Availability is not a proof issuer: no uncertified/missing selected slot
 // reaches arithmetic, and no record is substituted to repair a missing slot.
 const view=selectionPublication(readLabs.ticket,readLabs.coverage,readLabs.records);
 const missing=calculatePlan.calculations.some(c=>c.operands.some(slot=>{
  if(!isRecordedOperand(slot)||isRecordedAnchorOperand(slot))return false;
  const certificate=view?.certificates.find(cert=>cert.subjectId===slot.subjectId&&cert.clauseId===slot.clause);
  const id=certificate?.selectedEventIds[slot.item];
  return !certificate?.certified||certificate.status!=="complete"||!id
   ||!readLabs.records.some(row=>row.id===id&&row.petId===slot.subjectId);
 }));
 if(!view?.transportValid||!view.complete||missing){observeCalculation("materialization","selected_source_unavailable",plan);return null;}
 const execution=await executeCalculatePlan(calculatePlan,readLabs,context);
 if(!execution.complete||execution.authority!=="recorded_contents"){observeCalculation("execution","result_limited",plan);return null;}
 const labs={readLabs,calculatePlan:rebindCalculatePlan(calculatePlan,readLabs.ticket),execution,presentation,
  petNames:Object.fromEntries(readLabs.ticket.subjects.petIds.map(id=>[id,e!.petNames?.[id]||"this pet"]))};
 snapshots.set(labs,JSON.stringify(labs));observeCalculation("materialization","completed",plan);return labs; }catch(error){observeCalculation("materialization",calculationErrorReason(error),plan);throw error;}
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
  const names=r.subjectIds.map(id=>labs.petNames[id]).join(", ");
  const roleLabel=(role:string)=>role[0].toUpperCase()+role.slice(1);
  const operands=r.upstreamResults.length?r.upstreamResults.map(o=>roleLabel(o.role)+": certified calculation input ("+o.unit+")").join("; "):r.operands.map(o=>roleLabel(o.slot.role)+": "+labs.petNames[o.subjectId]+"; "+
   (o.recordedPremise?JSON.stringify(o.literal)+" ["+o.sourceId+"]; stored event "+o.eventAt+"; saved "+o.recordedPremise.source.recordedAt+"; source version "+o.recordedPremise.source.version+"; SHA256 "+o.recordedPremise.source.snapshotSHA256:(o.dimension==="instant"?o.eventAt:o.literal+"; event "+o.eventAt))).join("; ");
  const group=certificate?.groups.find(g=>g.calculationIds.includes(r.id));
  const rank=group?.rank;
  const prefix=rank!==null&&rank!==undefined?"Rank "+rank+(group!.calculationIds.length>1?" (tied)":"")+": ":"";
  return {label:prefix+labels[r.operator]+" for "+names,result,operands};
 });
 const cell=(s:string)=>s.replaceAll("|","\\|").replace(/[\r\n]/g," ");
 if(labs.presentation==="table")return [...(labs.execution.authority==="recorded_contents"?["Arithmetic over attributed recorded contents only; this does not certify effective, current or clinical truth.",""]:[]),"| Calculation | Result | "+(labs.execution.authority==="recorded_contents"?"Recorded inputs":"Certified inputs")+" |","| --- | --- | --- |",
  ...rows.map(r=>"| "+cell(r.label)+" | "+cell(r.result)+" | "+cell(r.operands)+" |")].join("\n");
 return (labs.execution.authority==="recorded_contents"?"Arithmetic over attributed recorded contents only; this does not certify effective, current or clinical truth.\n\n":"")+rows.map(r=>(labs.presentation==="list"?"- ":"")+r.label+": "+r.result+"."+(r.operands?" "+r.operands+".":"")).join(labs.presentation==="list"?"\n":"\n\n");
}
const empty=(v:unknown)=>Array.isArray(v)&&v.length===0;
function noOtherAuthority(r:AskReasoningResult){
 return !r.labsList&&!r.profileFieldLabs&&!r.historyNarrative&&!r.historicalResult&&!r.historySynthesis?.length
  &&[r.applicationActions,r.careActions,r.semanticEvents,r.learnings,r.referencedRecords,r.suggestedFollowUps].every(empty)
  &&!!r.proposedHistoryUpdate&&Object.entries(r.proposedHistoryUpdate).every(([k,v])=>k==="shouldOffer"?v===false:v===null);
}
export function calculationPublicationFailure(r:AskReasoningResult):string|null;
export function calculationPublicationFailure(r:AskReasoningResult,context:RecordedCalculationContext):Promise<string|null>;
export function calculationPublicationFailure(r:AskReasoningResult,context?:RecordedCalculationContext):string|null|Promise<string|null>{
 if(context)return recordedPublicationFailure(r,context);
 if(r.calculationLabs?.execution?.authority==="recorded_contents"){
  const receipt=publicationReceipts.get(r.calculationLabs);
  if(!receipt||receipt.bytes!==JSON.stringify(r.calculationLabs))return "recorded_revalidation_required";
  try{receipt.context.assertCurrent?.();return publicationFailure(r,r.calculationLabs.execution,receipt.context.scope.userId);}catch{return "recorded_request_expired";}
 }
 return publicationFailure(r);
}
async function recordedPublicationFailure(r:AskReasoningResult,context:RecordedCalculationContext):Promise<string|null>{
 const labs=r.calculationLabs;
 observeCalculation("publication","started",labs?.calculatePlan);
 if(!labs||snapshots.get(labs)!==JSON.stringify(labs)||labs.execution.authority!=="recorded_contents")return "recorded_snapshot_changed";
 publicationReceipts.delete(labs);
 try{
  context.assertCurrent?.();
  for(const node of labs.execution.results){
   if(node.status!=="certified")return "recorded_calculation_limited";
   for(const o of node.operands){
    const p=o.recordedPremise,slot=o.slot;
    if(!p||!isRecordedOperand(slot))return "recorded_proof_missing";
    await revalidateRecordedNumericPremise(p,{...context,labs:labs.readLabs},{subjectId:slot.subjectId,...recordedOperandPosition(slot),start:p.measurement.start,end:p.measurement.end,quote:p.measurement.quote,unit:slot.unit,operator:"difference",role:slot.role});
   }
  }
  const fresh=await executeCalculatePlan(labs.calculatePlan,labs.readLabs,context);
  context.assertCurrent?.();
  const failure=publicationFailure(r,fresh,context.scope.userId);
  if(!failure)publicationReceipts.set(labs,{context,bytes:JSON.stringify(labs)});
  observeCalculation("publication",failure?"result_limited":"completed",labs.calculatePlan);
  return failure;
 }catch{observeCalculation("publication","publication_source_changed",labs.calculatePlan);return "recorded_source_changed";}
}
function publicationFailure(r:AskReasoningResult,fresh?:CalculateExecution,ownerId?:string):string|null{
 const e=r.evidenceContract;
 if(!calculationRequestValid(e)||!noOtherAuthority(r)||r.answer.title!=="Furvise"||r.answer.sections.length||r.answer.safetyNote)return "calculation_contract";
 if(r.model===CALCULATION_UNAVAILABLE){
  return !r.calculationLabs&&r.answer.summary===calculationLimitation(e)&&empty(r.relevantContextIds)
   &&!(e!.answerSourceIds?.length||e!.answerContent?.length)?null:"calculation_limitation_changed";
 }
 if(!calculationCapability(e!.interpretation!.request!.calculatePlan!,e!.interpretation!.request!.readTicket!,ownerId).supported)return CALCULATION_CAPABILITY_UNSUPPORTED;
 const labs=r.calculationLabs;
 if(r.model!==CALCULATION_LABS||!labs||snapshots.get(labs)!==JSON.stringify(labs)
  ||!readLabsSnapshotMatches(labs.readLabs)||!same(labs.calculatePlan,e!.interpretation!.request!.calculatePlan)
  ||!same(labs.readLabs.ticket,e!.interpretation!.request!.readTicket)
  ||!same(labs.readLabs.coverage,e!.history?.ticketCoverage)
  ||labs.presentation!==labsPresentation(e!.interpretation!.request!.outputFormat)
  ||Object.entries(labs.petNames).some(([id,name])=>name!==(e!.petNames?.[id]||"this pet"))
  ||!labs.execution.complete||!same(labs.execution,fresh??executeCalculatePlan(labs.calculatePlan,labs.readLabs))
  ||r.answer.summary!==serializeCalculationLabs(labs)||!same(r.relevantContextIds,calculationSourceIds(labs))
  ||e!.answerSourceIds&& !same(e!.answerSourceIds,calculationSourceIds(labs))
  ||e!.answerContent?.length)return "calculation_snapshot_changed";
 return null;
}
export function carryCalculationLabs(source:AskReasoningResult,target:AskReasoningResult){
 if(calculationPublicationFailure(source))throw Error("CALCULATION_CLONE_CHANGED");
 const sourcePlan=source.evidenceContract?.interpretation?.request?.calculatePlan;
 const targetPlan=target.evidenceContract?.interpretation?.request?.calculatePlan;
 if(sourcePlan&&targetPlan)carryCalculatePlan(sourcePlan,targetPlan,target.evidenceContract!.interpretation!.request!.readTicket!);
 if(source.calculationLabs&&target.calculationLabs){
  if(!same(source.calculationLabs,target.calculationLabs))throw Error("CALCULATION_CLONE_CHANGED");
  // Restore only the exact trusted server object; JSON copies never mint proof authority.
  if(source.calculationLabs.execution.authority==="recorded_contents"){target.calculationLabs=source.calculationLabs;return;}
  carryReadLabsSnapshot(source.calculationLabs.readLabs,target.calculationLabs.readLabs);
  carryCalculatePlan(source.calculationLabs.calculatePlan,target.calculationLabs.calculatePlan,target.calculationLabs.readLabs.ticket);
  snapshots.set(target.calculationLabs,JSON.stringify(target.calculationLabs));
 }
}
