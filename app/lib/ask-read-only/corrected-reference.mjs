import {positiveOwnedPets} from "./subject-scope.mjs";
import {explicitCalendarWindow} from "./calendar-scope.mjs";

/** A current explicit owned-pet/calendar lookup can replace an old reference
 * HINT. This grants no reference read and never retargets an omitted interval:
 * the new ordinary search still goes through the existing owner-bound binder. */
export function reconcileCorrectedReference(first,plan,context){
 if(!Array.isArray(plan)||!plan.length||plan.length>6||!context?.question||!Array.isArray(context.pets)||!Array.isArray(context.references))return null;
 const historical=plan.filter(t=>t?.needsHistory===true);
 if(historical.length!==1||plan.some(t=>["clinical_guidance","vet_brief"].includes(t?.kind)))return null;
 const task=historical[0],safety=first?.safety;
 if(task?.kind!=="saved_content"||!task.needsHistory||task.needsOwnerFacts||!["single","collection"].includes(task.recordMode)
  ||!Array.isArray(task.pets)||task.pets.length>1||task.pets.some(h=>!context.pets.some(p=>p.handle===h))
  ||!Array.isArray(task.missing)||task.missing.some(k=>!["pet","year","date_meaning","which_record"].includes(k)))return null;
 if(!["none","clinical_history"].includes(safety?.careContext)||safety.medicationIntent!=="none"
  ||![undefined,"none","historical"].includes(safety.scenario)||(safety.currentEvents?.length||safety.conditionalEvents?.length||safety.currentConcern===true)
  ||!Array.isArray(safety.missingContext)||safety.missingContext.some(k=>!["pet","date"].includes(k)))return null;
 if(/\b(?:if|whether|hypothetical|suppose)\b/iu.test(context.question))return null;
 const targets=positiveOwnedPets(context.question,context.pets),calendar=explicitCalendarWindow(context.question);
 if(targets.length!==1||!calendar)return null;
 const pet=targets[0],reference=context.references.find(r=>r.reference===task.reference);
 if(!reference||reference.kind!=="history"||!context.pets.some(p=>p.handle===reference.petHandle))return null;
 let basis=first.historyIntent?.timeBasis;
 if(!["event","recorded"].includes(basis)){
  if(/\b(?:saved|recorded|entered|logged|occurred|happened)\s+(?:in|on|during)\b/iu.test(context.question))return null;
  const axes=new Set(context.references.filter(r=>r.kind==="history"&&r.petHandle===reference.petHandle).map(r=>r.orderBy));
  if(axes.size!==1||!["event","recorded"].includes(reference.orderBy))return null;
  basis=reference.orderBy;
 }
 const savedAxis=/\b(?:saved|recorded|entered|logged)\s+(?:in|on|during)\b/iu.test(context.question);
 if(savedAxis&&basis!=="recorded")return null;
 const event=basis==="event",same=reference.petHandle===pet.handle&&reference.orderBy===basis&&
  (event?reference.from===calendar.from&&reference.to===calendar.to&&reference.recordedFrom==null&&reference.recordedTo==null:
   reference.recordedFrom===calendar.from&&reference.recordedTo===calendar.to&&reference.from==null&&reference.to==null);
 if(same||!Array.isArray(first.calls)||first.calls.length>1)return null;
 let planned={};
 if(first.calls.length){
  const call=first.calls[0];try{planned=JSON.parse(call.arguments);}catch{return null;}
  if(!planned||typeof planned!=="object"||Array.isArray(planned))return null;
  if(call.name==="read_referenced_sources"){if(planned.reference!==task.reference)return null;}
  else if(call.name!=="search_saved_records")return null;
 }
 const goal=task.recordMode==="collection"?"complete_set":"exact_quote";
 const args={pet:pet.handle,from:event?calendar.from:null,to:event?calendar.to:null,
  recordedFrom:event?null:calendar.from,recordedTo:event?null:calendar.to,goal,alternatives:[],orderBy:basis,
  order:planned.order==="desc"?"desc":"asc",query:null,offset:0};
 return {...first,text:"",historyIntent:{requested:true,timeBasis:basis,pet:pet.handle},
  safety:{...safety,referent:"clear",missingContext:[]},
  calls:[{id:"corrected-calendar-read",name:"search_saved_records",arguments:JSON.stringify(args)}],
  taskPlan:plan.map(t=>t===task?{...task,reference:null,pets:[pet.handle],combineHistory:false,missing:task.missing.filter(k=>!["pet","year","date_meaning"].includes(k))}:t),
  scopeCorrection:{method:"explicit_owned_calendar_correction",calendarPrecision:calendar.precision,timeBasis:basis,
   discardedReference:true,discardedReferenceRead:first.calls[0]?.name==="read_referenced_sources"}};
}
