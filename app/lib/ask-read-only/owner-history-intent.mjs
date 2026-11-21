import { explicitCalendarScopes, explicitRequestedTimeBasis, namedPetsForHistory } from "./calendar-scope.mjs";

const historyTaskKinds=["saved_content","clarification","general_guidance"];
const resolvedScopeFields=["pet","date","year","date_meaning","which_record"];
const firstVisit=/\b(?:first (?:got|adopted|brought)\b|(?:first |just )?(?:came|brought|bring) (?:\w+ )?home\b|(?:when|after) (?:\w+ )?(?:arrived|was adopted)\b|first (?:collar|harness|meal|toy)\b)\b/i;
const singleReference=/\b(?:that|same|this) (?:saved |first )?(?:visit|appointment|checkup|note|entry|record|reading|weigh-in|event|report|measurement)\b/i;

/** For a directly referred note, a subject term can select a verbatim sentence. */
export function retainedNoteQuestionTerms(question){
 const identity=/^\s*(?:was|were) (?:that|it|those)\s+([\p{L}][\p{L}-]{3,30})\s*\??$/iu.exec(question)?.[1];
 const topic=/^\s*did (?:i|we) (?:say|note|write|record|mention)\b[^?!.]{0,72}\b(?:in|about)\s+([\p{L}][\p{L}-]{3,30})\s+(?:at|in|during|on)\s+(?:that|the same)\s+(?:visit|appointment|checkup|check|note|entry|record)\s*\??$/iu.exec(question)?.[1];
 const word=identity??topic;
 return word?[word.toLowerCase()]:[];
}

export function historyOnlyInferenceQuestion(question){
 return /^[^.!?]+\??$/.test(question.trim())
  && /^(?:given|based (?:only )?on|from|using|with)\b[^?]{0,55}\b(?:old|older|past|historical|previous)\b[^?]{0,30}\b(?:records?|notes?|entries|reports?)\b/i.test(question)
  && /\b(?:can (?:you|we|i) (?:tell|know|confirm|say)|(?:prove|establish|confirm))\b/i.test(question)
  && /\b(?:currently|today|still|now|at present)\b/i.test(question)
  && !/\b(?:and (?:what|how|when|can|should)|should|treatment|diagnose|dose|emergency)\b/i.test(question);
}

/** Recover a documented read intent against authorized pets and sources.
 * The first-stage judgment can block recovery for clinical or mixed work. */
export function recoverOwnerHistoryIntent(first,context,pets,references){
 const tasks=first.taskPlan,question=context.question;
 const named=namedPetsForHistory(question,pets);
 const safety=first.safety;
 // A single explicit past-event question with a concrete location has an
 // occurrence axis, even when the first pass split it into redundant tasks.
 const occurrence=/^\s*when did\s+([^?!.]+?)\s+(?:at|to|near|in)\s+(?:(?:the|a|an)\s+)?([\p{L}\p{N}][\p{L}\p{N} -]{2,79})\s*\??$/iu.exec(question);
 // A location can contain another pet's name. Only the clause preceding
 // the location identifies the subject of an occurrence search.
 const subjects=occurrence?namedPetsForHistory(occurrence[1],pets):[];
 if(subjects.length===1&&tasks?.length&&safety?.medicationIntent==="none"
   &&!safety.currentEvents?.length&&!safety.conditionalEvents?.length
   &&!safety.eventAssessments?.some(event=>event.occurrence!=="historical")
   &&!explicitCalendarScopes(question).length&&!explicitRequestedTimeBasis(question)
   &&!/\b(?:and|or|then|before|after|between|since|as of|earliest|latest|first)\b/i.test(question)
   &&tasks.every(task=>historyTaskKinds.includes(task.kind)&&!task.reference&&!task.needsOwnerFacts)){
  const pet=subjects[0];
  const place=occurrence[2].trim();
  const args={pet:pet.handle,from:null,to:null,goal:"relevant_records",query:place,offset:0,orderBy:"event",order:"desc"};
  return {...first,text:"",calls:[{id:"owner-event-date",name:"search_saved_records",arguments:JSON.stringify(args)}],
   historyIntent:{requested:true,timeBasis:"event",pet:pet.handle},safety:{...safety,referent:"clear",missingContext:[]},
   taskPlan:[{...tasks[0],kind:"saved_content",needsHistory:true,recordMode:"single",workflow:"none",
    pets:[pet.handle],reference:null,includeSourceDates:false,missing:[]}]};
 }
 // A fresh, explicit owner-note topic resolves planner ambiguity about
 // which read to run. The topic words remain retrieval hints until verified.
 const topic=/^\s*what did (?:i|we) (?:write|note|record|say|write down) about\s+([^?.!]{1,120})\??$/i.exec(question)?.[1];
 const freshTopic=topic&&named.length===1&&!context.dialogue?.length&&!references.length
  &&!explicitCalendarScopes(question).length&&!explicitRequestedTimeBasis(question)
  &&!/\b(?:earlier answer|previous result|then|and (?:what|when|why|how|did|should|can)|all|every|ever|always|never|latest|first|last|only|currently|today|should|can i)\b/i.test(question);
 if(freshTopic&&tasks?.length&&safety&&["none","clinical_history"].includes(safety.careContext)
  &&safety.medicationIntent==="none"&&!safety.currentEvents?.length&&!safety.conditionalEvents?.length
  &&!safety.eventAssessments?.some(event=>event.occurrence!=="historical")
  &&safety.missingContext.every(key=>resolvedScopeFields.includes(key))
  &&tasks.every(task=>historyTaskKinds.includes(task.kind)&&!task.needsOwnerFacts
    &&task.missing.every(key=>resolvedScopeFields.includes(key)))){
  const pet=named[0];
  const names=new Set(pet.name.toLowerCase().match(/[\p{L}]{3,}/gu)??[]);
  const tokens=topic.toLowerCase().match(/[\p{L}]{3,}/gu)??[];
  const terms=[...new Set(tokens.filter(word=>!names.has(word)
   &&!["the","when","what","about","after","before","during","getting","being","with","from","that","those","this","have","having","said","wrote"].includes(word)))];
  if(terms.length){
   const args={pet:pet.handle,from:null,to:null,goal:"relevant_records",query:terms[0],alternatives:terms.slice(1,3),offset:0,orderBy:"event",order:"desc"};
   return {...first,text:"",calls:[{id:"owner-note-topic",name:"search_saved_records",arguments:JSON.stringify(args)}],
    historyIntent:{requested:true,timeBasis:"event",pet:pet.handle},safety:{...safety,referent:"clear",missingContext:[]},
    taskPlan:[{...tasks[0],kind:"saved_content",needsHistory:true,recordMode:"single",workflow:"none",
     pets:[pet.handle],reference:null,missing:[]}]};
  }
 }
 // A short follow-up about what the owner said can refer to the one
 // journal note just used, even when the planner mistakes it for chat text.
 const priorQuestion=context.dialogue?.at(-2);
 const noteFollowup=/^\s*did (?:i|we) (?:say|mention|write|note|record)\b[^?!]{1,115}\??$/i.test(question)
  &&/\b(?:it|that|this|there)\b/i.test(question)
  &&!/\b(?:chat|conversation|earlier here|today|new note|different note|should|can i)\b/i.test(question);
 const retainedTerms=retainedNoteQuestionTerms(question);
 const priorWasNoteTopic=priorQuestion?.role==="user"&&/^\s*what did (?:i|we) (?:write|note|record|say|write down) about\b/i.test(priorQuestion.text);
 if((noteFollowup&&priorWasNoteTopic||retainedTerms.length&&priorQuestion?.role==="user")
  &&context.dialogue.at(-1)?.role==="assistant"&&tasks?.length&&safety&&["none","clinical_history"].includes(safety.careContext)
  &&safety.medicationIntent==="none"&&!safety.currentEvents?.length&&!safety.conditionalEvents?.length
  &&!safety.eventAssessments?.some(event=>event.occurrence!=="historical")
  &&safety.missingContext.every(key=>resolvedScopeFields.includes(key))
  &&tasks.every(task=>(historyTaskKinds.includes(task.kind)||task.kind==="owner_observations")
    &&task.missing.every(key=>resolvedScopeFields.includes(key)||key==="owner_observation"))){
  const active=references.filter(ref=>ref.usedInPreviousAnswer);
  if(active.length===1&&active[0].request.kind==="history"&&active[0].request.expectedSources?.length===1){
   const {handle,request}=active[0];
   if(named.every(pet=>pet.handle===request.pet.handle)&&context.selectedPet===request.pet.handle){
    return {...first,text:"",calls:[{id:"owner-note-follow-up",name:"read_referenced_sources",arguments:JSON.stringify({reference:handle})}],
     historyIntent:{requested:true,timeBasis:request.orderBy,pet:request.pet.handle},safety:{...safety,referent:"clear",missingContext:[]},
     taskPlan:[{...tasks[0],kind:"saved_content",needsHistory:true,needsOwnerFacts:false,recordMode:"single",workflow:"none",
      pets:[request.pet.handle],reference:handle,missing:[]}]};
   }
  }
 }
 const earlyArrival=firstVisit.test(question)&&!explicitCalendarScopes(question).length&&!explicitRequestedTimeBasis(question)
  &&!/\b(?:and (?:how|what|when)|today|currently|now)\b/i.test(question);
 const canCollapseArrival=earlyArrival&&tasks?.length&&tasks.every(task=>historyTaskKinds.includes(task.kind)&&!task.reference&&!task.needsOwnerFacts
  &&task.pets.every(handle=>named.length===1&&handle===named[0].handle));
 if(!tasks?.length||tasks.length!==1&&!canCollapseArrival||!historyTaskKinds.includes(tasks[0].kind)||tasks[0].needsOwnerFacts)return null;
 if(!safety||!["none","clinical_history"].includes(safety.careContext)||safety.medicationIntent!=="none"
  ||safety.currentEvents?.length||safety.conditionalEvents?.length
  ||safety.eventAssessments?.some(event=>event.occurrence!=="historical")
  ||safety.missingContext.some(key=>!resolvedScopeFields.includes(key))
  ||tasks[0].missing.some(key=>!resolvedScopeFields.includes(key)))return null;
 const task=tasks[0];
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
 const eventQuestion=/^\s*when\b/i.test(question)&&!explicitRequestedTimeBasis(question)
  &&!/\b(?:before|after|between|since|as of|last|latest|earliest|first)\b/i.test(question);
 if(first.calls.length&&eventQuestion&&first.calls.every(call=>call.name==="search_saved_records")
  &&args.every(call=>!call.recordedFrom&&!call.recordedTo)){
  const calls=first.calls.map((call,index)=>{
   return {...call,arguments:JSON.stringify({...args[index],orderBy:"event",recordedFrom:null,recordedTo:null})};
  });
  return recovered(named[0],calls);
 }
 return null;
}

// A positive topic lookup can be answered with one directly matching
// sentence. This does not assert uniqueness across the journal or completeness.
export function verifiedOwnerNoteTopic(terms,sources,minTerms=2){
 if(!terms||terms.length<minTerms||terms.some(term=>term.length<4))return null;
 const segmenter=new Intl.Segmenter("en",{granularity:"sentence"});
 const matches=[];
 for(const source of sources){
  for(const {segment} of segmenter.segment(source.body)){
   const excerpt=segment.trim();
   if(!excerpt||excerpt.length>400)continue;
   const words=new Set(excerpt.toLowerCase().match(/[\p{L}]+/gu)??[]);
   if(terms.every(term=>["","s","es","ed","ing","ness"].some(suffix=>words.has(term+suffix)))){
    matches.push({source,excerpt});
    break;
   }
  }
 }
 return matches.length===1?matches[0]:null;
}
