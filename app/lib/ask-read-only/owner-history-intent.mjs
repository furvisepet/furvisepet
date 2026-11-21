import { explicitCalendarScopes, explicitRequestedTimeBasis, namedPetsForHistory } from "./calendar-scope.mjs";

const historyTaskKinds=["saved_content","clarification","general_guidance"];
const resolvedScopeFields=["pet","date","year","date_meaning","which_record"];
const firstVisit=/\b(?:first (?:got|adopted|brought)\b|(?:first |just )?(?:came|brought|bring) (?:\w+ )?home\b|(?:when|after) (?:\w+ )?(?:arrived|was adopted)\b|first (?:collar|harness|meal|toy)\b)\b/i;
const singleReference=/\b(?:that|same|this) (?:saved |first )?(?:visit|appointment|checkup|note|entry|record|reading|weigh-in|event|report|measurement)\b/i;

export function historyOnlyInferenceQuestion(question){
 return /\b(?:given|based on|from|using|with)\b[^?]{0,55}\b(?:old|older|past|historical|previous)\b[^?]{0,30}\b(?:records?|notes?|entries|reports?)\b/i.test(question)
  && /\b(?:can (?:you|we|i) (?:tell|know|confirm|say)|(?:prove|establish|confirm))\b/i.test(question)
  && /\b(?:currently|today|still|now|at present)\b/i.test(question)
  && !/\b(?:and (?:what|how|when|can|should)|should|treatment|diagnose|dose|emergency)\b/i.test(question);
}

/** Recover a documented read intent against authorized pets and sources.
 * The first-stage judgment can block recovery for clinical or mixed work. */
export function recoverOwnerHistoryIntent(first,context,pets,references){
 const tasks=first.taskPlan,question=context.question;
 if(tasks?.length!==1||!historyTaskKinds.includes(tasks[0].kind)||tasks[0].needsOwnerFacts)return null;
 const safety=first.safety;
 if(!safety||!["none","clinical_history"].includes(safety.careContext)||safety.medicationIntent!=="none"
  ||safety.currentEvents?.length||safety.conditionalEvents?.length
  ||safety.eventAssessments?.some(event=>event.occurrence!=="historical")
  ||safety.missingContext.some(key=>!resolvedScopeFields.includes(key))
  ||tasks[0].missing.some(key=>!resolvedScopeFields.includes(key)))return null;
 const task=tasks[0],named=namedPetsForHistory(question,pets);
 let args;
 try{args=first.calls.map(call=>JSON.parse(call.arguments));}catch{return null;}
 if(named.length>1||explicitCalendarScopes(question).length)return null;
 const recovered=(pet,calls,reference=null,includeSourceDates=task.includeSourceDates,timeBasis="event")=>{
  if(task.pets.some(handle=>handle!==pet.handle))return null;
  return {...first,text:"",calls,historyIntent:{requested:true,timeBasis,pet:pet.handle},
   safety:{...safety,referent:"clear",missingContext:[]},
   taskPlan:[{...task,kind:"saved_content",needsHistory:true,recordMode:"single",
    workflow:"none",pets:[pet.handle],reference,includeSourceDates,missing:[]}]};
 };

 if(singleReference.test(question)&&context.dialogue?.at(-1)?.role==="assistant"){
  const history=references.filter(({request,usedInPreviousAnswer})=>usedInPreviousAnswer&&request.kind==="history"&&request.expectedSources?.length===1
   && (named.length===1?request.pet.handle===named[0].handle:request.pet.handle===context.selectedPet));
  const selected=history.length===1&&(task.reference===null||task.reference===history[0].handle)?history[0]:null;
  if(selected&&first.calls.every((call,index)=>call.name==="read_referenced_sources"&&args[index]?.reference===selected.handle))
   return recovered(selected.request.pet,first.calls,selected.handle,task.includeSourceDates,selected.request.orderBy);
 }
 if(named.length!==1||task.reference||first.calls.some((call,index)=>!["search_saved_records","read_pet_profile"].includes(call.name)
  ||args[index]?.pet!==named[0].handle))return null;
 if(firstVisit.test(question)&&!explicitRequestedTimeBasis(question)
  &&!/\b(?:and (?:how|what|when)|today|currently|now)\b/i.test(question)){
  const collar=/\bfirst (collar|harness|meal|toy)\b/i.exec(question)?.[1];
  const args={pet:named[0].handle,from:null,to:null,recordedFrom:null,recordedTo:null,
   goal:"relevant_records",query:collar??"arrived",alternatives:collar?[]:["adopted","came home"],offset:0,orderBy:"event",order:"asc"};
  return recovered(named[0],[{id:"owner-early-history",name:"search_saved_records",arguments:JSON.stringify(args)}]);
 }
 // A matching event search can answer when something happened. A user does
 // not need to choose between the observation date and the storage timestamp.
 if(first.calls.length&&/\bwhen\b/i.test(question)&&!explicitRequestedTimeBasis(question)
  &&first.calls.every(call=>call.name==="search_saved_records")
  &&args.every(call=>!call.recordedFrom&&!call.recordedTo)){
  const calls=first.calls.map((call,index)=>{
   return {...call,arguments:JSON.stringify({...args[index],orderBy:"event",recordedFrom:null,recordedTo:null})};
  });
  return recovered(named[0],calls);
 }
 return null;
}
