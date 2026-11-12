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
export function recoverBoundedCalendarRead(first,context,pets){
 if(first.historyIntent?.requested!==true||!["event","recorded"].includes(first.historyIntent.timeBasis)||first.calls.length>1
  ||first.safety?.referent!=="essential_unknown"||!first.safety.missingContext.length||first.safety.missingContext.some(k=>!["pet","date"].includes(k)))return null;
 const scopes=explicitCalendarScopes(context.question);if(scopes.length!==1)return null;
 const escaped=name=>name.replace(/[.*+?$^{}()|[\]\\]/g,"\\$&");
 const named=pets.filter(pet=>new RegExp("(?<![\\p{L}\\p{N}])"+escaped(pet.name)+"(?![\\p{L}\\p{N}])","iu").test(context.question));
 if(named.length!==1||first.historyIntent.pet!==null&&first.historyIntent.pet!==named[0].handle)return null;
 if(first.calls.some(call=>!["search_saved_records","read_referenced_sources","read_pet_profile"].includes(call.name)))return null;
 let planned={};try{planned=JSON.parse(first.calls[0]?.arguments??"{}");}catch{return null;}
 const goal=EVIDENCE_GOALS.includes(planned.goal)?planned.goal:"relevant_records",order=planned.order==="desc"?"desc":"asc";
 const basis=first.historyIntent.timeBasis,scope=scopes[0],event=basis==="event";
 return {first:{...first,text:"",safety:{...first.safety,referent:"clear",missingContext:[]},calls:[{id:"calendar-read",name:"search_saved_records",arguments:JSON.stringify({
  pet:named[0].handle,from:event?scope.from:null,to:event?scope.to:null,goal,alternatives:[],
  recordedFrom:event?null:scope.from,recordedTo:event?null:scope.to,orderBy:basis,query:null,offset:0,order
 })}]},diagnostic:{precision:scope.precision,timeBasis:basis,reason:"explicit_owned_pet_calendar_scope"}};
}
