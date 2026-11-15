const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
const operations=["difference","percent_change"];
const metrics=["body_weight","food_mass","body_length"];
const date={type:["string","null"],pattern:"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"};
export function measurementRequestSchema(context){
 const endpoint=object({from:date,to:date,reference:{type:["string","null"],enum:[...context.references.map(r=>r.reference),null]}});
 return {type:"array",maxItems:2,items:object({task:{type:"string",enum:["t1","t2","t3","t4","t5","t6"]},pet:{type:"string",enum:context.pets.map(p=>p.handle)},metric:{type:"string",enum:metrics},operation:{type:"string",enum:operations},timeBasis:{type:"string",enum:["event","recorded"]},start:endpoint,finish:endpoint})};
}
export const MEASUREMENT_INSTRUCTIONS="For each saved-measurement signed change or percentage change, supply measurementRequests with ONE independently owned pet per request and separate start/finish endpoint scopes. Resolve the owner's actual endpoint period, including a shared period in a two-pet question. Fresh endpoints use precise calendar windows (a named month means that whole month), reference=null. For the same endpoints follow-up, select each retained result's reference, from=to=null; re-read BOTH endpoints. Never use the earlier assistant's numeric result as input. If scope is ambiguous, ask a pointed clarification and leave measurementRequests empty. Task reference stays null; measurement tasks are collections even when endpoints are single notes. Use event dates unless the owner explicitly selects recording time. Percent change uses the earlier measurement as denominator, never the difference or final value. The server selects unique typed measurements and computes; never put literal operands or computed numbers in prose. Include separate requests for two pets and never use another pet's source. This plan supplies reads; do not omit it merely because no read tool was chosen. Other requests use measurementRequests=[].";
const keys=(v,k)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join(",")===[...k].sort().join(",");
const esc=s=>s.replace(/[.*+?^$()|{}\[\]\\]/g,"\\MODULE_PLACEHOLDER");
function invalid(){throw Object.assign(new Error("ASK_READ_MEASUREMENT_SCOPE"),{code:"ASK_READ_MEASUREMENT_SCOPE"});}
export function compileMeasurementRequests(requests,first,plan,context,bind){
 if(!Array.isArray(requests)||requests.length>2)invalid();
 if(!requests.length)return null;
 const calls=[],bindings=[];
 const add=call=>{const old=calls.find(c=>c.name===call.name&&c.arguments===call.arguments);if(old)return old.id;calls.push(call);return call.id;};
 for(const [i,q] of requests.entries()){
  if(!keys(q,["task","pet","metric","operation","timeBasis","start","finish"])||!operations.includes(q.operation)||!metrics.includes(q.metric)||!["event","recorded"].includes(q.timeBasis))invalid();
  const task=plan?.find(t=>t.id===q.task),pet=context.pets.find(p=>p.handle===q.pet);
  if(!task||task.kind!=="calculation"||!task.needsHistory||task.needsOwnerFacts||!pet||!task.pets.includes(q.pet)||task.missing.some(k=>!["pet","year","date_meaning","which_record"].includes(k)))invalid();
  const endpoints=[];let petId;
  for(const [side,e] of [["start",q.start],["finish",q.finish]]){
   if(!keys(e,["from","to","reference"]))invalid();
   let call;
   if(e.reference!==null){
    const ref=context.references.find(r=>r.reference===e.reference);
    if(e.from!==null||e.to!==null||!ref||ref.petHandle!==q.pet||ref.kind!=="history"||ref.orderBy!==q.timeBasis)invalid();
    call={id:"measurement-"+i+"-"+side,name:"read_referenced_sources",arguments:JSON.stringify({reference:e.reference})};
   }else{
    if(typeof e.from!=="string"||typeof e.to!=="string"||e.from>e.to)invalid();
    const named=context.pets.filter(p=>new RegExp("(?<![\\p{L}\\p{N}])"+esc(p.name)+"(?![\\p{L}\\p{N}])","iu").test(context.question));
    if(!named.some(p=>p.handle===q.pet)||context.pets.filter(p=>p.name.toLocaleLowerCase()===pet.name.toLocaleLowerCase()).length!==1)invalid();
    const event=q.timeBasis==="event";
    call={id:"measurement-"+i+"-"+side,name:"search_saved_records",arguments:JSON.stringify({pet:q.pet,from:event?e.from:null,to:event?e.to:null,recordedFrom:event?null:e.from,recordedTo:event?null:e.to,goal:"comparison",alternatives:[],orderBy:q.timeBasis,order:"asc",query:null,offset:0})};
   }
   const bound=bind(call.name,JSON.parse(call.arguments));
   if(bound.kind!=="history"||bound.pet.handle!==q.pet)invalid();
   if(petId&&petId!==bound.pet.id)invalid();petId=bound.pet.id;
   endpoints.push(add(call));
  }
  bindings.push({...q,petId,petName:pet.name,calls:endpoints});
 }
 const calculationPets=new Set(requests.map(q=>q.pet));
 for(const call of first.calls){
  const bound=bind(call.name,JSON.parse(call.arguments));
  if(!calculationPets.has(bound.pet.handle)||plan.some(t=>t.kind!=="calculation"&&t.needsHistory&&t.pets.includes(bound.pet.handle)))add(call);
 }
 if(calls.length>4)invalid();
 const taskIds=new Set(requests.map(q=>q.task));
 return {calls,bindings,plan:plan.map(t=>taskIds.has(t.id)?{...t,recordMode:"collection",reference:null,missing:[]}:t)};
}
export function resolveMeasurementRequests(bindings,results,sources){
 return bindings.map(q=>{
  const endpoints=q.calls.map(call=>{
   const result=results.find(r=>r.call===call);
   if(!result||result.unmet?.some(x=>["retrieval_unavailable","referenced_source_changed_or_missing","query_scope_not_exhausted","evidence_omitted"].includes(x)))return [];
   const handles=new Set(result.sources.map(s=>s.source));
   return sources.filter(s=>handles.has(s.handle)&&s.kind==="history"&&s.petId===q.petId)
    .flatMap(s=>(s.measurements??[]).filter(m=>m.metric===q.metric).map(m=>({handle:m.handle,source:s.handle,petId:s.petId,time:Date.parse(q.timeBasis==="event"?s.eventAt:s.recordedAt)})));
  });
  const [a,b]=endpoints;
  const available=a.length===1&&b.length===1&&a[0].handle!==b[0].handle&&a[0].petId===b[0].petId&&a[0].time<b[0].time;
  return {task:q.task,petName:q.petName,reason:available?null:a.length>1||b.length>1?"ambiguous":!a.length||!b.length?"unavailable":"chronology",available,sources:available?[a[0].source,b[0].source]:[],calculation:available?{operation:q.operation,timeBasis:q.timeBasis,operands:[a[0].handle,b[0].handle]}:null};
 });
}
