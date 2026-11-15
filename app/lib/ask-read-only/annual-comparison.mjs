const scopeFields=new Set(["pet","year","date_meaning","which_record"]);
const esc=s=>s.replace(/[.*+?^$()|[\]\\{}]/g,"\\$&");
function annual(r,axis){
 const event=axis==="event",lo=event?r.from:r.recordedFrom,hi=event?r.to:r.recordedTo;
 if((event?r.recordedFrom||r.recordedTo:r.from||r.to)||typeof lo!=="string"||typeof hi!=="string")return null;
 const m=/^((?:19|20|21)\d{2}|2200)-01-01$/.exec(lo);
 return m&&hi===m[1]+"-12-31"?m[1]:null;
}
function subjects(question,pets){
 const mentions=[];
 for(const p of pets){
  if(typeof p.name!=="string"||!p.name.trim())continue;
  for(const m of question.matchAll(new RegExp("(?<![\\p{L}\\p{N}])"+esc(p.name)+"(?![\\p{L}\\p{N}])","giu"))){
   if(/\b(?:not|rather than|instead of|except|excluding)\s*$/iu.test(question.slice(Math.max(0,m.index-40),m.index)))continue;
   mentions.push({pet:p,start:m.index,end:m.index+m[0].length});
  }
 }
 mentions.sort((a,b)=>a.start-b.start);
 if(mentions.length!==2||new Set(mentions.map(m=>m.pet.handle)).size!==2||mentions[0].end>mentions[1].start)return null;
 const out=[];
 for(let i=0;i<2;i++){
  const m=mentions[i],clause=question.slice(m.end,mentions[i+1]?.start??question.length),years=[];
  for(const y of clause.matchAll(/\b((?:19|20|21)\d{2}|2200)\b/g)){
   if(/\b(?:not|rather than|instead of|except|excluding)\s*$/iu.test(clause.slice(Math.max(0,y.index-40),y.index)))continue;
   years.push(y[1]);
  }
  if(new Set(years).size!==1)return null;
  out.push({...m,year:years[0]});
 }
 return out;
}
/** Only an explicit two-pet ANNUAL comparison correction qualifies. Metadata
 * resolves scope, never values. Both the changed search and unchanged source
 * rehydration pass the existing owner-bound binder; acquisition stays bounded. */
export function recoverAnnualComparison(first,plan,context,bind){
 if(typeof bind!=="function"||!Array.isArray(plan)||!Array.isArray(context?.pets)||!Array.isArray(context.references)||typeof context.question!=="string")return null;
 const combined=plan.length===1&&plan[0].pets?.length===2&&new Set(plan[0].pets).size===2;
 if(!combined&&(plan.length!==2||plan.some(t=>t.pets.length!==1)||new Set(plan.map(t=>t.pets[0])).size!==2))return null;
 if(plan.some(t=>t.kind!=="calculation"||t.needsOwnerFacts||t.missing.some(k=>!scopeFields.has(k))))return null;
 if(combined&&(!Array.isArray(first.calls)||first.calls.length!==2))return null;
 const s=first.safety;
 if(!s||s.medicationIntent!=="none"||!["none","education"].includes(s.careContext)||![undefined,"none"].includes(s.scenario)||s.currentEvents?.length||s.conditionalEvents?.length||s.currentConcern===true||!Array.isArray(s.missingContext)||s.missingContext.some(k=>!["pet","date"].includes(k)))return null;
 if(!Array.isArray(first.calls)||first.calls.length>2||new Set(first.calls.map(c=>c?.id)).size!==first.calls.length)return null;
 // Never widen a month, day, relative interval or hypothetical request to a year.
 if(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|quarter|today|yesterday|tomorrow|last|next|if|suppose|hypothetical)\b|\b\d{4}-\d{2}/iu.test(context.question))return null;
 const named=subjects(context.question,context.pets);if(!named||plan.some(t=>t.pets.some(h=>!named.some(n=>n.pet.handle===h))))return null;
 const axes=new Set(context.references.filter(r=>r.kind==="history"&&named.some(n=>n.pet.handle===r.petHandle)).map(r=>r.orderBy));
 if(axes.size!==1)return null;
 const axis=[...axes][0];if(!["event","recorded"].includes(axis)||!["ambiguous",axis,...(combined?["combined"]:[])].includes(first.historyIntent?.timeBasis))return null;
 if(axis==="event"&&/\b(?:saved|recorded|entered|logged)\s+(?:in|on|during)\b/iu.test(context.question))return null;
 if(axis==="recorded"&&/\b(?:happened|occurred|event dates?)\b/iu.test(context.question))return null;
 const scopes=[];
 for(const n of named){
  const refs=context.references.filter(r=>r.kind==="history"&&r.petHandle===n.pet.handle&&annual(r,axis));
  if(refs.length!==1)return null;
  const r=refs[0],old=annual(r,axis),dateKey=axis==="event"?"eventAt":"recordedAt";
  if(r.selectionLimited||r.discoveryIncomplete||r.omittedRange||r.omittedEventRange||r.sourceCount<2||r.sourceCount>8||!Array.isArray(r.sourceDates)||!r.sourceDates.some(d=>d[dateKey]?.startsWith(old+"-01-"))||!r.sourceDates.some(d=>d[dateKey]?.startsWith(old+"-12-")))return null;
  if(context.timeZone&&r.timeZone!==context.timeZone)return null;
  const t=combined?plan[0]:plan.find(t=>t.pets[0]===n.pet.handle);
  // A known hint can have been attached to the other requested side. The
  // explicit two-pet/year scopes above choose membership; identity is checked
  // separately. Unknown/foreign/third-pet hints never gain authority here.
  if(t.reference!==null&&!context.references.some(ref=>ref.reference===t.reference&&named.some(n=>n.pet.handle===ref.petHandle)))return null;
  scopes.push({...n,ref:r,old,task:t,changed:old!==n.year});
 }
 if(scopes.filter(n=>n.changed).length!==1||!scopes.some(n=>!n.changed))return null;
 // Validate original planned reads before replacing any scope; forged/foreign
 // locators or malformed tool arguments cannot be laundered by this recovery.
 const originalSides=new Set();
 for(const call of first.calls){
  if(!call||Object.keys(call).sort().join(",")!=="arguments,id,name"||typeof call.id!=="string"||!call.id||typeof call.arguments!=="string"||call.arguments.length>5000||!["search_saved_records","read_referenced_sources"].includes(call.name))return null;
  let args;try{args=JSON.parse(call.arguments);}catch{return null;}
  const request=bind(call.name,args),n=scopes.find(n=>n.pet.handle===request.pet?.handle);
  if(!n||request.kind!=="history"||request.continuation||combined&&originalSides.has(n.pet.handle))return null;
  originalSides.add(n.pet.handle);
  if(call.name==="read_referenced_sources"){if(args.reference!==n.ref.reference)return null;}
  else {const y=annual(request,axis);if(!y||![n.old,n.year].includes(y)||request.orderBy!==axis||args.offset!==0)return null;}
 }
 if(combined&&originalSides.size!==2)return null;
 const calls=scopes.map(n=>{
  const t=n.task,event=axis==="event";
  const call=n.changed?{id:"annual-correction-"+t.id,name:"search_saved_records",arguments:JSON.stringify({pet:n.pet.handle,from:event?n.year+"-01-01":null,to:event?n.year+"-12-31":null,recordedFrom:event?null:n.year+"-01-01",recordedTo:event?null:n.year+"-12-31",goal:"comparison",alternatives:[],orderBy:axis,order:"asc",query:null,offset:0})}:{id:"annual-rehydrate-"+t.id,name:"read_referenced_sources",arguments:JSON.stringify({reference:n.ref.reference})};
  bind(call.name,JSON.parse(call.arguments));return call;
 });
 const tasks=plan.map(t=>{const n=combined?null:scopes.find(n=>n.task===t);return {...t,needsHistory:true,recordMode:"collection",combineHistory:false,reference:combined||n.changed?null:n.ref.reference,missing:t.missing.filter(k=>!scopeFields.has(k))};});
 return {first:{...first,text:"",calls,safety:{...s,referent:"clear",missingContext:[]},historyIntent:{...first.historyIntent,requested:true,timeBasis:axis,pet:null}},plan:tasks,diagnostic:{method:"explicit_owned_annual_comparison",timeBasis:axis,correctedReads:1,rehydratedReads:1}};
}

/** Resolve redundant scope flags against independently literal annual
 * membership AND already owner-bound ordinary reads. No read is created here. */
export function reconcilePlannedAnnualCalculation(first,plan,context,bound){
 if(!Array.isArray(plan)||plan.length<1||plan.length>2||!Array.isArray(bound)||![2,4].includes(bound.length)||!context?.question||!Array.isArray(context.pets))return null;
 const provable=new Set(["pet","year","date_meaning"]);
 if(!plan.some(t=>t.missing.some(k=>provable.has(k)))||plan.some(t=>t.kind!=="calculation"||!t.needsHistory||t.needsOwnerFacts||t.recordMode!=="collection"||t.reference!==null||t.missing.some(k=>!provable.has(k))))return null;
 const safety=first.safety,axis=first.historyIntent?.timeBasis;
 if(first.historyIntent?.requested!==true||!["event","recorded"].includes(axis)||!safety||safety.medicationIntent!=="none"||!["none","education"].includes(safety.careContext)||![undefined,"none"].includes(safety.scenario)||safety.currentEvents?.length||safety.conditionalEvents?.length||safety.currentConcern===true||!Array.isArray(safety.missingContext)||safety.missingContext.length)return null;
 const text=context.question;
 if(/["“”\x60]|\b(?:feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|quarter|today|yesterday|tomorrow|next|if|suppose|hypothetical|before|after|since)\b|\b\d{4}-\d{2}/iu.test(text))return null;
 // Annual wording needs no month qualifier. Any explicit endpoint months must be paired.
 const hasJanuary=/\bjan(?:uary)?\b/i.test(text),hasDecember=/\bdec(?:ember)?\b/i.test(text);if(hasJanuary!==hasDecember)return null;
 if(/\blast\s+(?:year|month|week|day)\b/i.test(text))return null;
 if(axis==="event"&&/\b(?:saved|recorded|entered|logged)\s+(?:in|on|during)\b/iu.test(text)||axis==="recorded"&&/\b(?:happened|occurred|event dates?)\b/iu.test(text))return null;
 if(axis==="recorded"&&!/\b(?:saved|recorded|entered|logged)\s+(?:in|on|during)\b/iu.test(text))return null;
 const named=subjects(text,context.pets);if(!named||bound.some(c=>!named.some(n=>n.pet.handle===c.request?.pet?.handle)))return null;
 const plannedPets=[...new Set(plan.flatMap(t=>t.pets))];
 if(plannedPets.length!==2||plannedPets.some(h=>!named.some(n=>n.pet.handle===h)))return null;
 for(const n of named){
  const reads=bound.filter(c=>c.request?.pet?.handle===n.pet.handle);if(![1,2].includes(reads.length))return null;
  if(reads.length===2&&(new Set(reads.map(c=>c.request.order)).size!==2||reads.some(c=>!["asc","desc"].includes(c.request.order))))return null;
  for(const c of reads){const r=c.request;
   if(!["search_saved_records","read_referenced_sources"].includes(c.name)||r.kind!=="history"||r.continuation||!["comparison","complete_set",...(reads.length===2?["boundary"]:[])].includes(r.goal)||(c.name==="read_referenced_sources"?![undefined,0].includes(r.offset):r.offset!==0)||r.orderBy!==axis||annual(r,axis)!==n.year||r.terms?.some(term=>!/^(?:body\s+weight|weights?|weighed|weigh(?:ing)?|weigh[- ]?ins?|kg|kilograms?)$/i.test(term.trim())))return null;
   if(c.name==="read_referenced_sources"){
    const ref=context.references?.find(ref=>ref.reference===r.reference&&ref.petHandle===n.pet.handle);
    if(!ref||ref.kind!=="history"||ref.orderBy!==axis||annual(ref,axis)!==n.year||ref.selectionLimited||ref.discoveryIncomplete||ref.omittedRange||ref.omittedEventRange)return null;
   }else if(r.reference)return null;
  }
 }
 return {plan:plan.map(t=>({...t,missing:t.missing.filter(k=>!provable.has(k))})),diagnostic:{method:"literal_two_pet_annual_planned_reads",timeBasis:axis,petCount:2,readCount:bound.length,grantsAdditionalReads:false}};
}
