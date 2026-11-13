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
 return [...new Map(found.map(scope=>[scope.from+"/"+scope.to,scope])).values()];
}
/** Only an explicit contiguous range joins two windows; independent comparisons
 * and corrections remain separate. No relative dates or axis inference. */
export function explicitCalendarWindow(question){
 const scopes=explicitCalendarScopes(question);
 if(scopes.length===1)return scopes[0];
 if(scopes.length!==2)return null;
 const token="(?:\\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\\.?\\s+(?:\\d{1,2},?\\s+)?(?:19|20|21)\\d{2}\\b|\\b(?:19|20|21)\\d{2}-\\d{2}(?:-\\d{2})?\\b)";
 const ranges=[...String(question).matchAll(new RegExp("("+token+")\\s+(?:through|to|until)\\s+("+token+")","gi"))];
 if(ranges.length!==1)return null;
 const left=explicitCalendarScopes(ranges[0][1]),right=explicitCalendarScopes(ranges[0][2]);
 if(left.length!==1||right.length!==1||left[0].from>right[0].to
  ||scopes[0].from!==left[0].from||scopes[0].to!==left[0].to||scopes[1].from!==right[0].from||scopes[1].to!==right[0].to)return null;
 return {from:left[0].from,to:right[0].to,precision:"range"};
}
export function recoverBoundedCalendarRead(first,context,pets){
 if(!["event","recorded"].includes(first.historyIntent?.timeBasis)||first.calls.length>1)return null;
 const calendar=explicitCalendarWindow(context.question);if(!calendar)return null;
 const escaped=name=>name.replace(/[.*+?$^{}()|[\]\\]/g,"\\$&");
 const named=pets.filter(pet=>new RegExp("(?<![\\p{L}\\p{N}])"+escaped(pet.name)+"(?![\\p{L}\\p{N}])","iu").test(context.question));
 if(named.length!==1)return null;
 let planned={};try{planned=JSON.parse(first.calls[0]?.arguments??"{}");}catch{return null;}
 if(!planned||typeof planned!=="object"||Array.isArray(planned))return null;
 const basis=first.historyIntent.timeBasis,event=basis==="event";
 const matchingPlanned=first.calls.length===1&&first.calls[0].name==="search_saved_records"&&planned.pet===named[0].handle&&planned.offset===0&&(planned.orderBy??basis)===basis
  &&(event?planned.from===calendar.from&&planned.to===calendar.to&&planned.recordedFrom==null&&planned.recordedTo==null:planned.recordedFrom===calendar.from&&planned.recordedTo===calendar.to&&planned.from==null&&planned.to==null);
 const nonUrgentHistory=["none","clinical_history"].includes(first.safety?.careContext)&&first.safety.medicationIntent==="none"&&[undefined,"none","historical"].includes(first.safety.scenario)&&!(first.safety.currentEvents?.length||first.safety.conditionalEvents?.length);
 const taskBound=(first.calls.length===0||matchingPlanned)&&first.taskPlan?.some(t=>t.kind==="saved_content"&&t.needsHistory&&t.reference===null&&t.pets.length===1&&t.pets[0]===named[0].handle&&t.missing.every(k=>["pet","year","which_record","date_meaning"].includes(k)))
  &&nonUrgentHistory&&first.safety.missingContext.every(k=>["pet","date"].includes(k));
 const legacy=nonUrgentHistory&&first.historyIntent?.requested===true&&first.safety?.referent==="essential_unknown"&&first.safety.missingContext.length>0&&first.safety.missingContext.every(k=>["pet","date"].includes(k))&&(first.historyIntent.pet===null||first.historyIntent.pet===named[0].handle);
 if(!taskBound&&!legacy)return null;
 if(first.calls.some(call=>!["search_saved_records","read_referenced_sources","read_pet_profile"].includes(call.name)))return null;
 const goal=EVIDENCE_GOALS.includes(planned.goal)?planned.goal:first.taskPlan?.some(t=>t.kind==="saved_content"&&t.needsHistory&&t.recordMode==="collection"&&t.pets.length===1&&t.pets[0]===named[0].handle)?"complete_set":"relevant_records",order=planned.order==="desc"?"desc":"asc";
 const scope=calendar;
 // A concrete first-pass axis plus one explicit owned pet/calendar window
 // resolves contradictory pet/year/axis flags. It does not resolve record identity:
 // which_record remains until bounded discovery proves a unique source.
 const taskPlan=first.taskPlan?.map(t=>t.kind==="saved_content"&&t.needsHistory&&t.reference===null&&t.pets.length===1&&t.pets[0]===named[0].handle&&t.missing.every(k=>["pet","year","which_record","date_meaning"].includes(k))
  ?{...t,missing:t.missing.filter(k=>!["pet","year","date_meaning"].includes(k))}:t);
 return {first:{...first,...(taskPlan?{taskPlan}:{}),text:"",historyIntent:{...first.historyIntent,requested:true,pet:named[0].handle},safety:{...first.safety,referent:"clear",missingContext:[]},calls:[{id:"calendar-read",name:"search_saved_records",arguments:JSON.stringify({
  pet:named[0].handle,from:event?scope.from:null,to:event?scope.to:null,goal,alternatives:[],
  recordedFrom:event?null:scope.from,recordedTo:event?null:scope.to,orderBy:basis,query:null,offset:0,order
 })}]},diagnostic:{precision:scope.precision,timeBasis:basis,reason:matchingPlanned?"matching_owned_pet_calendar_read":"explicit_owned_pet_calendar_scope"}};
}
