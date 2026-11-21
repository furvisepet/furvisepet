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
 // Coordinated month lists can share a trailing year. Resolve that year
 // only inside a contiguous list of month names.
 const coordinated = new RegExp("\\b((?:" + aliases.map(([name])=>name).join("|") + ")(?:\\s*(?:,\\s*(?:and\\s+)?|\\s+and\\s+)(?:" + aliases.map(([name])=>name).join("|") + "))+)[ ]+((?:19|20|21)\\d{2}|2200)\\b", "g");
 for (const match of text.matchAll(coordinated)) {
  const year=Number(match[2]);
  for (const token of match[1].match(/[a-z]+/g)) {
   const month=aliases.find(([name])=>name===token)?.[1];
   if (month===undefined) continue;
   const prefix=year+"-"+String(month+1).padStart(2,"0")+"-";
   found.push({from:prefix+"01",to:prefix+String(new Date(Date.UTC(year,month+1,0)).getUTCDate()),precision:"month"});
  }
 }
 const monthMentions=[...text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/g)];
 const namedCount=[...text.matchAll(named)].length;
 const coordinatedCount=[...text.matchAll(coordinated)].reduce((count,match)=>count+match[1].match(/[a-z]+/g).filter(token=>token!=="and").length-1,0);
 if(monthMentions.length>namedCount+coordinatedCount)return [];
 // A year without a month is a full event/recorded calendar window. Never
 // turn a month or ISO date into an additional, broader year read.
 if(!found.length&&!monthMentions.length)for(const match of text.matchAll(/(?<![\d-])((?:19|20|21)\d{2}|2200)(?![\d-])/g))
  found.push({from:match[1]+"-01-01",to:match[1]+"-12-31",precision:"year"});
 const scopes=[...new Map(found.map(scope=>[scope.from+"/"+scope.to,scope])).values()].sort((a,b)=>a.from.localeCompare(b.from));
 // An explicit continuous year span includes the intervening years. A year
 // attached to an entry/note names an endpoint record instead.
 if(scopes.length===2&&scopes.every(scope=>scope.precision==="year")&&scopes[0].from<scopes[1].from){
  const range=text.match(/\b(?:between\s+((?:19|20|21)\d{2}|2200)\s+and\s+((?:19|20|21)\d{2}|2200)|from\s+((?:19|20|21)\d{2}|2200)\s+(?:to|through|until)\s+((?:19|20|21)\d{2}|2200))\b/);
  const fromYear=range?.[1]??range?.[3],toYear=range?.[2]??range?.[4];
  const endpointNoun=range&&/^\s+(?:(?:saved|journal|history)\s+)?(?:notes?|entries|records?|visits?)\b/.test(text.slice(range.index+range[0].length));
  if(fromYear===scopes[0].from.slice(0,4)&&toYear===scopes[1].from.slice(0,4)&&!endpointNoun)
   return [{from:scopes[0].from,to:scopes[1].to,precision:"interval"}];
 }
 return scopes;
}
/** A requested date axis is explicit only when the owner names one axis. */
export function explicitRequestedTimeBasis(question){
 const text=String(question);
 if(/\bevent\b/i.test(text)&&/\b(?:save|saved|record|recorded)\s+dates?\b/i.test(text))return null;
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
/** A unique substantial token in an owned display name can identify that pet
 * when the owner uses its familiar short name. Shared tokens never resolve. */
export function namedPetsForHistory(question,pets){
 const escaped=name=>name.replace(/[.*+?$^{}()|[\]\\]/g,"\\$&");
 const mentions=name=>new RegExp("(?<![\\p{L}\\p{N}])"+escaped(name)+"(?![\\p{L}\\p{N}])","iu").test(question);
 const full=pets.filter(pet=>mentions(pet.name));if(full.length)return full;
 const names=pets.map(pet=>[pet, [...new Set(pet.name.match(/\p{L}{3,}/gu)?.map(token=>token.toLocaleLowerCase())??[])]]);
 const owners=new Map();
 for(const [pet,tokens] of names)for(const token of tokens)owners.set(token,new Set([...(owners.get(token)??[]),pet.handle]));
 return names.filter(([,tokens])=>tokens.some(token=>owners.get(token)?.size===1&&mentions(token))).map(([pet])=>pet);
}
/** Bind a fresh, dated pet-note pronoun to the selected pet only with one safe scope. */
export function clarifyUnboundHistoryPronoun(first,context,pets){
 const question=String(context.question??"");
 if(context.dialogue?.length||context.references?.length
  ||!/\b(?:she|her|he|him|his|they|them|their)\b/i.test(question)
  ||!/\b(?:what happened|history|saved|note|record|entry)\b/i.test(question))return first;
 if(namedPetsForHistory(question,pets).length)return first;
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
/** Recover a plain comparison of two explicit saved-history periods when
 * the model has mislabeled the task or requested only one side. This is a
 * read-only owner-scoped retrieval plan, not a factual answer. */
export function recoverExplicitHistoryComparison(first,context,pets){
 const question=String(context.question??""),scopes=explicitCalendarScopes(question);
 const recordContent=/\b(?:notes?|entries|records?|history|journal|timeline|measured|measurements?|readings?)\b/i.test(question);
 const comparison=/\b(?:compare|differ|versus|vs|between|each|both|timeline|side[ -]by[ -]side)\b/i.test(question);
 if(scopes.length<2||scopes.length>4||!recordContent||!comparison
  ||/\b(?:delete|remove|edit|update|add|write|create|correct)\b/i.test(question)
  ||/\b(?:save|record)\s+(?:a|an|the|this|it|my)\b/i.test(question)
  ||/\b(?:how (?:do|can) I|how to|where (?:do|can) I|steps? to)\b/i.test(question))return null;
 const named=namedPetsForHistory(question,pets);
 if(named.length!==1||!first.taskPlan?.length||first.calls.length>4)return null;
 if(/\bevent\b/i.test(question)&&/\b(?:save|saved|record|recorded)\s+dates?\b/i.test(question))return null;
 const safety=first.safety;
 if(!["none","clinical_history"].includes(safety?.careContext)||safety.medicationIntent!=="none"
  ||safety.currentEvents?.length||safety.conditionalEvents?.length
  ||safety.eventAssessments?.some(event=>event.occurrence!=="historical")
  ||safety.missingContext?.some(key=>!["pet","date","year","date_meaning","which_record"].includes(key)))return null;
 if(!first.taskPlan.every(t=>["saved_content","general_guidance","clarification","workflow","calculation"].includes(t.kind)
  &&!t.reference&&!t.needsOwnerFacts&&t.pets.every(handle=>handle===named[0].handle)))return null;
 if(first.calls.some(call=>{
  if(!["search_saved_records","read_pet_profile"].includes(call.name))return true;
  try{return JSON.parse(call.arguments).pet!==named[0].handle;}catch{return true;}
 }))return null;
 const basis=requestedHistoryTimeBasis(question),event=basis==="event";
 const original=first.taskPlan.find(t=>t.kind==="saved_content")??first.taskPlan[0];
 const task={...original,kind:"saved_content",needsHistory:true,needsOwnerFacts:false,
  recordMode:"collection",workflow:"none",pets:[named[0].handle],reference:null,missing:[]};
 const calls=scopes.map((scope,index)=>({id:"comparison-read-"+index,name:"search_saved_records",arguments:JSON.stringify({
  pet:named[0].handle,from:event?scope.from:null,to:event?scope.to:null,goal:"comparison",alternatives:[],
  recordedFrom:event?null:scope.from,recordedTo:event?null:scope.to,orderBy:basis,query:null,offset:0,order:"asc"
 })}));
 return {first:{...first,text:"",calls,taskPlan:[task],
  historyIntent:{...first.historyIntent,requested:true,timeBasis:basis,pet:named[0].handle},
  safety:{...safety,referent:"clear",missingContext:[]}},
  diagnostic:{precision:scopes.map(s=>s.precision).join(","),scopeCount:scopes.length,timeBasis:basis,
   reason:"explicit_owned_history_comparison"}};
}
export function recoverBoundedCalendarRead(first,context,pets){
 if(first.calls.length>4)return null;
 // A question naming both axes genuinely needs the plan's explicit scope.
 const bothAxes=/\bevent\b/i.test(context.question)
  &&/\b(?:save|saved|record|recorded)\s+dates?\b/i.test(context.question);
 if(bothAxes&&!explicitRequestedTimeBasis(context.question))return null;
 const scopes=explicitCalendarScopes(context.question);if(scopes.length<1||scopes.length>4)return null;
 const named=namedPetsForHistory(context.question,pets);
 const selected=pets.find(pet=>pet.handle===context.selectedPet);
 const modelSubject=first.taskPlan?.length===1&&first.taskPlan[0].pets.length===1
  &&first.taskPlan[0].pets[0]===selected?.handle&&first.historyIntent?.pet===selected?.handle;
 // Unnamed questions may retain an already bound selection. Never infer an
 // unset pet from a calendar date or override a conflicting owned name.
 if(!named.length&&selected&&modelSubject&&!first.safety?.missingContext.includes("pet"))named.push(selected);
 if(named.length!==1)return null;
 const safe=first.safety?.careContext==="none"&&first.safety.medicationIntent==="none"
  &&!(first.safety.currentEvents?.length||first.safety.conditionalEvents?.length||first.safety.eventAssessments?.length)
  &&first.safety.missingContext.every(k=>["pet","date","year","date_meaning","which_record"].includes(k));
 const tasks=first.taskPlan?.filter(t=>t.needsHistory);
 const taskBound=!!tasks?.length&&tasks.every(t=>t.kind==="saved_content"&&t.reference===null
  &&(t.pets.length===0&&t.missing.includes("pet")||t.pets.length===1&&t.pets[0]===named[0].handle)
  &&t.missing.every(k=>["pet","which_record","year","date_meaning"].includes(k)))
  &&safe&&first.calls.length<=4&&first.calls.every(call=>["search_saved_records","read_pet_profile"].includes(call.name)
   &&(()=>{try{return JSON.parse(call.arguments).pet===named[0].handle;}catch{return false;}})());
 const noteDescription=/\b(?:in|from|according to)\s+(?:the |my |our )?([^?!.]{4,90})\s+(?:note|entry|record)\s*\??$/i.exec(context.question)?.[1];
 const describedNote=!!noteDescription&&(scopes[0].precision==="month"||scopes[0].precision==="day")
  &&explicitCalendarScopes(noteDescription).some(scope=>scope.from===scopes[0].from&&scope.to===scopes[0].to)
  &&!context.dialogue?.length&&!context.references?.length;
 const retrospectiveNoteSafe=describedNote&&first.safety?.careContext==="clinical_history"&&first.safety.medicationIntent==="none"
  &&!first.safety.currentEvents?.length&&!first.safety.conditionalEvents?.length
  &&!first.safety.eventAssessments?.some(event=>event.occurrence!=="historical")
  &&first.safety.missingContext.every(k=>["pet","date","year","date_meaning","which_record"].includes(k));
 const ordinaryDatedRead=(!taskBound||describedNote)&&scopes.length===1&&scopes[0].precision!=="interval"
  &&(safe||retrospectiveNoteSafe)&&first.taskPlan?.length
  &&/^\s*(?:what|which|when|was|were|did|where|how much)\b/i.test(context.question)
  &&!/\b(?:and (?:what|when|how|why|should|did)|compare|diagnose|should|why|all|every|each|count|how many|summarize)\b/i.test(context.question)
  &&first.taskPlan.every(task=>["saved_content","general_guidance","clarification"].includes(task.kind)
   &&!task.reference&&!task.needsOwnerFacts&&task.pets.every(handle=>handle===named[0].handle))
  &&first.calls.every(call=>{
   if(!["search_saved_records","read_pet_profile"].includes(call.name))return false;
   try{return JSON.parse(call.arguments)?.pet===named[0].handle;}catch{return false;}
  });
 const basis=requestedHistoryTimeBasis(context.question);
 if((first.safety.missingContext.includes("date_meaning")||tasks?.some(t=>t.missing.includes("date_meaning")))
  &&bothAxes)return null;
 const legacy=first.calls.length<=1&&scopes.length===1&&first.historyIntent?.requested===true&&first.safety?.referent==="essential_unknown"
  &&first.safety.missingContext.length>0&&first.safety.missingContext.every(k=>["pet","date"].includes(k))
  &&(first.historyIntent.pet===null||first.historyIntent.pet===named[0].handle);
 if(!taskBound&&!legacy&&!ordinaryDatedRead)return null;
 if(first.calls.some(call=>!["search_saved_records","read_referenced_sources","read_pet_profile"].includes(call.name)))return null;
 if(first.calls.some(call=>{try{return call.name==="search_saved_records"&&JSON.parse(call.arguments).pet!==named[0].handle;}catch{return true;}}))return null;
 let planned={};try{planned=JSON.parse(first.calls[0]?.arguments??"{}");}catch{return null;}
 const goal=scopes[0].precision==="interval"?"complete_set":scopes.length>1?"comparison":EVIDENCE_GOALS.includes(planned.goal)?planned.goal:"relevant_records";
 const order=planned.order==="desc"?"desc":"asc",event=basis==="event";
 const calls=scopes.map((scope,index)=>({id:"calendar-read-"+index,name:"search_saved_records",arguments:JSON.stringify({
  pet:named[0].handle,from:event?scope.from:null,to:event?scope.to:null,goal,alternatives:[],
  recordedFrom:event?null:scope.from,recordedTo:event?null:scope.to,orderBy:basis,query:null,offset:0,order
 })}));
 const taskPlan=ordinaryDatedRead&&(!legacy||describedNote)?[{...first.taskPlan[0],kind:"saved_content",needsHistory:true,recordMode:"single",
  workflow:"none",pets:[named[0].handle],reference:null,missing:[]}]:taskBound?first.taskPlan.map(t=>t.needsHistory?{...t,pets:[named[0].handle],recordMode:scopes.length>1||scopes[0].precision==="interval"?"collection":t.recordMode,
  missing:t.missing.filter(k=>k!=="pet"&&k!=="year"&&k!=="date_meaning"&&(scopes.length===1&&scopes[0].precision!=="interval"||k!=="which_record"))}:t):first.taskPlan;
 return {first:{...first,text:"",taskPlan,historyIntent:{...first.historyIntent,requested:true,timeBasis:basis,pet:named[0].handle},
  safety:{...first.safety,referent:"clear",missingContext:[]},calls},
  diagnostic:{precision:scopes.map(s=>s.precision).join(","),scopeCount:scopes.length,timeBasis:basis,reason:"explicit_owned_pet_calendar_scope"}};

}

/** Compare the first and last actual measurements in one explicit period.
 * A bounded pair of ordered scans preserves the distinction between note
 * chronology and measurement availability. */
export function recoverWeightPeriodEndpoints(first,context,pets){
 const question=context.question;
 const scopes=explicitCalendarScopes(question),named=namedPetsForHistory(question,pets);
 if(scopes.length!==1||named.length!==1||!/^\s*how much did\b[^?!.]{0,80}\bweigh\b[^?!.]{0,80}\b(?:start|beginning) and (?:the )?end\b[^?!.]*\??$/i.test(question)
  ||!first.taskPlan?.length||first.safety?.careContext!=="none"||first.safety.medicationIntent!=="none"
  ||first.safety.currentEvents?.length||first.safety.conditionalEvents?.length||first.safety.eventAssessments?.length
  ||!first.taskPlan.every(task=>["saved_content","clarification","general_guidance","calculation"].includes(task.kind)&&!task.reference&&!task.needsOwnerFacts))return null;
 const pet=named[0],scope=scopes[0],basis=requestedHistoryTimeBasis(question),event=basis==="event";
 const calls=["asc","desc"].map(order=>({id:"weight-endpoint-"+order,name:"search_saved_records",arguments:JSON.stringify({
  pet:pet.handle,from:event?scope.from:null,to:event?scope.to:null,recordedFrom:event?null:scope.from,recordedTo:event?null:scope.to,
  orderBy:basis,order,goal:"boundary",query:null,offset:0})}));
 const original=first.taskPlan[0];
 return {first:{...first,text:"",calls,historyIntent:{requested:true,timeBasis:basis,pet:pet.handle},
  safety:{...first.safety,referent:"clear",missingContext:[]},
  taskPlan:[{...original,kind:"saved_content",needsHistory:true,recordMode:"collection",workflow:"none",
   pets:[pet.handle],reference:null,missing:[]}]},
  diagnostic:{precision:scope.precision,scopeCount:1,timeBasis:basis,reason:"owned_period_weight_endpoints"}};
}
