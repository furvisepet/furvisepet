import {EVIDENCE_GOALS} from "./retrieval.mjs";
/** Explicit calendar recognition only: no relative-time or event/recorded guessing. */
const months=["january","february","march","april","may","june","july","august","september","october","november","december"];
const aliases=months.flatMap((name,index)=>[[name,index],[name.slice(0,3),index]]);
export function explicitCalendarScopes(question){
 const text=String(question).toLowerCase(),found=[];
 const named=/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(?:(\d{1,2}),?\s+)?((?:19|20|21)\d{2}|2200)\b/g;
 for(const match of text.matchAll(named)){
  const month=aliases.find(([name])=>name===match[1])?.[1],year=Number(match[3]),day=match[2]?Number(match[2]):null;
  if(month==null)continue;
  const from=year+"-"+String(month+1).padStart(2,"0")+"-"+String(day??1).padStart(2,"0");
  const end=day??new Date(Date.UTC(year,month+1,0)).getUTCDate(),to=year+"-"+String(month+1).padStart(2,"0")+"-"+String(end).padStart(2,"0");
  const date=new Date(from+"T00:00:00Z");if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==from)continue;
  found.push({from,to,precision:day?"day":"month"});
 }
 for(const match of text.matchAll(/\b((?:19|20|21)\d{2}|2200)-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?\b/g)){
  const from=match[1]+"-"+match[2]+"-"+(match[3]??"01"),to=match[3]?from:match[1]+"-"+match[2]+"-"+String(new Date(Date.UTC(Number(match[1]),Number(match[2]),0)).getUTCDate()).padStart(2,"0");
  const date=new Date(from+"T00:00:00Z");if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==from)continue;
  found.push({from,to,precision:match[3]?"day":"month"});
 }
 const monthMentions=[...text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/g)];
 if(monthMentions.length>found.length)return [];
 // A year without a month is a full event/recorded calendar window. Never
 // turn a month or ISO date into an additional, broader year read.
 if(!found.length&&!monthMentions.length)for(const match of text.matchAll(/(?<![\d-])((?:19|20|21)\d{2}|2200)(?![\d-])/g))
  found.push({from:match[1]+"-01-01",to:match[1]+"-12-31",precision:"year"});
 return [...new Map(found.map(scope=>[scope.from+"/"+scope.to,scope])).values()];
}
/** A requested date axis is explicit only when the owner names one axis. */
export function explicitRequestedTimeBasis(question){
 const text=String(question);
 if(/\bevent\b/i.test(text)&&/\b(?:save|saved|record|recorded)\b/i.test(text)&&/\bdates?\b/i.test(text))return null;
 const event=/\bevent(?:[-\s]+(?:dates?|days?|history))?\b/i.test(text)
  &&(/\bevent[-\s]+(?:dates?|days?|history)\b/i.test(text)||/\b(?:what|which|on what) day\b|\bwhen\b/i.test(text));
 const recorded=/\b(?:save|saved|record|recorded) dates?\b/i.test(text)
  ||/\b(?:what|which|how many)\b.{0,80}\b(?:was|were|did I|have I)\s+(?:saved|recorded)\b/i.test(text)
  ||/\b(?:notes?|records?|entries)\s+(?:I\s+)?(?:saved|recorded)\s+(?:on|in|during)\b/i.test(text)
  ||/\b(?:notes?|records?|entries)\s+did\s+I\s+(?:save|record)\b/i.test(text)
  ||/\b(?:what|which|when|how many)\b.{0,100}\b(?:saved|recorded)\s*\?/i.test(text)
  ||/\b(?:when|what day)\b.{0,100}\b(?:was|were)\s+(?:the\s+)?(?:notes?|records?|entries)?\s*(?:saved|recorded)\b/i.test(text);
 return event===recorded?null:event?"event":"recorded";
}
/** Historical events use event time unless the owner explicitly asks when an
 * entry was saved. A model-selected recorded axis is not an owner instruction. */
export function requestedHistoryTimeBasis(question){
 return explicitRequestedTimeBasis(question)??"event";
}
/** Bind a fresh, dated pet-note pronoun to the selected pet only with one safe scope. */
export function clarifyUnboundHistoryPronoun(first,context,pets){
 const question=String(context.question??"");
 if(context.dialogue?.length||context.references?.length
  ||!/\b(?:she|her|he|him|his|they|them|their)\b/i.test(question)
  ||!/\b(?:what happened|history|saved|note|record|entry)\b/i.test(question))return first;
 const escaped=name=>name.replace(/[.*+?$^{}()|[\]\\]/g,"\\$&");
 if(pets.some(pet=>new RegExp("(?<![\\p{L}\\p{N}])"+escaped(pet.name)+"(?![\\p{L}\\p{N}])","iu").test(question)))return first;
 const tasks=first.taskPlan;
 if(!tasks?.length||!tasks.every(t=>t.kind==="saved_content"&&t.needsHistory&&t.reference===null))return first;
 const selected=pets.find(pet=>pet.handle===context.selectedPet);
 const scopes=explicitCalendarScopes(question);
 const safe=first.safety?.careContext==="none"&&first.safety.medicationIntent==="none"
  &&!(first.safety.currentEvents?.length||first.safety.conditionalEvents?.length||first.safety.eventAssessments?.length)
  &&first.safety.missingContext?.every(k=>["pet","date","year","which_record"].includes(k));
 const notePronoun=/\b(?:her|his|their)\b.{0,80}\b(?:saved|note|record|entry)\b|\b(?:saved|note|record|entry)\b.{0,80}\b(?:her|his|their)\b/i.test(question);
 const otherReferent=/\b(?:vet|veterinarian|doctor|friend|partner|wife|husband|mother|father|daughter|son)\b/i.test(question);
 if(selected&&scopes.length===1&&notePronoun&&!otherReferent&&safe
  &&first.calls.length<=2&&first.calls.every(call=>["search_saved_records","read_pet_profile"].includes(call.name))){
  const scope=scopes[0],basis=explicitRequestedTimeBasis(question)??"event",event=basis==="event";
  const args={pet:selected.handle,from:event?scope.from:null,to:event?scope.to:null,
   goal:"exact_quote",alternatives:[],recordedFrom:event?null:scope.from,recordedTo:event?null:scope.to,
   orderBy:basis,query:null,offset:0,order:"asc"};
  return {...first,text:"",calls:[{id:"selected-pet-calendar-read",name:"search_saved_records",arguments:JSON.stringify(args)}],
   historyIntent:{...first.historyIntent,requested:true,timeBasis:basis,pet:selected.handle},
   safety:{...first.safety,referent:"clear",missingContext:[]},
   taskPlan:tasks.map(t=>({...t,pets:[selected.handle],missing:t.missing.filter(k=>!["pet","year","date"].includes(k))}))};
 }
 return {...first,text:"",calls:[],taskPlan:tasks.map(t=>({...t,pets:[],missing:[...new Set([...t.missing,"pet"])]}))};
}
export function recoverBoundedCalendarRead(first,context,pets){
 if(first.calls.length>2)return null;
 // A question naming both axes genuinely needs the plan's explicit scope.
 const bothAxes=/\bevent\b/i.test(context.question)
  &&/\b(?:save|saved|record|recorded)\b/i.test(context.question)
  &&/\bdates?\b/i.test(context.question);
 if(bothAxes&&!explicitRequestedTimeBasis(context.question))return null;
 const scopes=explicitCalendarScopes(context.question);if(scopes.length<1||scopes.length>2)return null;
 const escaped=name=>name.replace(/[.*+?$^{}()|[\]\\]/g,"\\$&");
 const named=pets.filter(pet=>new RegExp("(?<![\\p{L}\\p{N}])"+escaped(pet.name)+"(?![\\p{L}\\p{N}])","iu").test(context.question));
 if(named.length!==1)return null;
 const safe=first.safety?.careContext==="none"&&first.safety.medicationIntent==="none"
  &&!(first.safety.currentEvents?.length||first.safety.conditionalEvents?.length||first.safety.eventAssessments?.length)
  &&first.safety.missingContext.every(k=>["pet","date","year","date_meaning","which_record"].includes(k));
 const tasks=first.taskPlan?.filter(t=>t.needsHistory);
 const taskBound=!!tasks?.length&&tasks.every(t=>t.kind==="saved_content"&&t.reference===null
  &&(t.pets.length===0&&t.missing.includes("pet")||t.pets.length===1&&t.pets[0]===named[0].handle)
  &&t.missing.every(k=>["pet","which_record","year","date_meaning"].includes(k)))
  &&safe&&first.calls.length<=2&&first.calls.every(call=>["search_saved_records","read_pet_profile"].includes(call.name)
   &&(()=>{try{return JSON.parse(call.arguments).pet===named[0].handle;}catch{return false;}})());
 const basis=requestedHistoryTimeBasis(context.question);
 if((first.safety.missingContext.includes("date_meaning")||tasks?.some(t=>t.missing.includes("date_meaning")))
  &&bothAxes)return null;
 const legacy=first.calls.length<=1&&scopes.length===1&&first.historyIntent?.requested===true&&first.safety?.referent==="essential_unknown"
  &&first.safety.missingContext.length>0&&first.safety.missingContext.every(k=>["pet","date"].includes(k))
  &&(first.historyIntent.pet===null||first.historyIntent.pet===named[0].handle);
 if(!taskBound&&!legacy)return null;
 if(first.calls.some(call=>!["search_saved_records","read_referenced_sources","read_pet_profile"].includes(call.name)))return null;
 if(first.calls.some(call=>{try{return call.name==="search_saved_records"&&JSON.parse(call.arguments).pet!==named[0].handle;}catch{return true;}}))return null;
 let planned={};try{planned=JSON.parse(first.calls[0]?.arguments??"{}");}catch{return null;}
 const goal=scopes.length===2?"comparison":EVIDENCE_GOALS.includes(planned.goal)?planned.goal:"relevant_records";
 const order=planned.order==="desc"?"desc":"asc",event=basis==="event";
 const calls=scopes.map((scope,index)=>({id:"calendar-read-"+index,name:"search_saved_records",arguments:JSON.stringify({
  pet:named[0].handle,from:event?scope.from:null,to:event?scope.to:null,goal,alternatives:[],
  recordedFrom:event?null:scope.from,recordedTo:event?null:scope.to,orderBy:basis,query:null,offset:0,order
 })}));
 const taskPlan=taskBound?first.taskPlan.map(t=>t.needsHistory?{...t,pets:[named[0].handle],recordMode:scopes.length===2?"collection":t.recordMode,
  missing:t.missing.filter(k=>k!=="pet"&&k!=="year"&&k!=="date_meaning"&&(scopes.length!==2||k!=="which_record"))}:t):first.taskPlan;
 return {first:{...first,text:"",taskPlan,historyIntent:{...first.historyIntent,requested:true,timeBasis:basis,pet:named[0].handle},
  safety:{...first.safety,referent:"clear",missingContext:[]},calls},
  diagnostic:{precision:scopes.map(s=>s.precision).join(","),scopeCount:scopes.length,timeBasis:basis,reason:"explicit_owned_pet_calendar_scope"}};

}
