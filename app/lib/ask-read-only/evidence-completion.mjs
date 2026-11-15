import {validateHistorySynthesis} from "./history-synthesis.mjs";
import {readSourceMeasurements} from "./calculations.mjs";
import { createHash } from "node:crypto";
import { explicitCalendarScopes } from "./calendar-scope.mjs";

const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
const choice=values=>({type:"string",enum:values});
const keys=(value,names)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k));
function reject(field){throw Object.assign(new Error("ASK_READ_COMPONENT_CONTRACT"),{code:"ASK_READ_COMPONENT_CONTRACT",answerDiagnostic:{category:"evidence_completion",field}});}
const collection=t=>t.needsHistory&&t.recordMode==="collection"&&["saved_content","saved_continuation"].includes(t.kind);
const reviewSources=(plan,sources)=>plan?.some(collection)?sources.filter(s=>s.kind==="history"):[];

export const EVIDENCE_COMPLETION_INSTRUCTIONS=[
 "Independently check the current owner request against the first-pass task plan. evidenceCompletion.sourceReview is an object with one required key for EVERY admitted historical source handle; assign each key one classification: routine, noteworthy, uncertain or irrelevant. For a collection give at most four short themes with at most two representative excerpts each; do not enumerate all routine bodies or duplicate historical facts in themes. For a continuation, prioritize the actual fresh_remainder TOOL_DATA sources, including distinct new routine/nutrition findings, then integrate relevant retained_prior context. Do not use a single repeated routine phrase as the entire account of the omitted interval. Coverage is supplied by the server. Read each actual narrative. A date or ordinary weight difference alone does not make a routine report noteworthy. Mark source-specific unusual changes, exceptions and contrasting observations noteworthy; do not fill every theme with routine boilerplate while skipping those reports. These classifications grant no diagnosis, episode count, recurrence or trend authority. The server can publish a bounded exact original note for noteworthy evidence that the synthesis missed, with its actual historical date.",
 "For a vet brief that explicitly requests a prior saved report, independently check that it was actually read. When SOURCE_CATALOG is empty and eligibleHistorySupplements lists a matching single-note reference, evidenceCompletion.missingReference may select its task and reference plus a verbatim requestExcerpt from the CURRENT owner question. Use this even if the first pass mistakenly marked needsHistory=false or its date basis ambiguous. Otherwise missingReference=null. This selects only an existing owner-bound locator; metadata and prior assistant prose are not factual evidence. The server rehydrates and copies the original historical note without a third model call. Do not invent historyFacts or a prescription plan. A current emergency forbids this recovery. Never request an unrelated historical note merely because a reference exists."
].join("\n");

export function supplementCandidates(plan,references,canRecover,context={}){
 if(!canRecover||!plan)return [];
 // A missed newly dated search must not silently become a read of an old note.
 if(explicitCalendarScopes(context.question??"").length||/\b(?:(?:19|20|21)\d{2}|2200)\b/.test(context.question??""))return [];
 const text=String(context.question??"").toLocaleLowerCase();
 const named=(context.pets??[]).filter(p=>{
  const name=String(p.name).toLocaleLowerCase();if(!name)return false;
  for(let i=text.indexOf(name);i>=0;i=text.indexOf(name,i+1)){
   const before=Array.from(text.slice(0,i)).at(-1),after=Array.from(text.slice(i+name.length))[0];
   if((!before||!/[\p{L}\p{N}]/u.test(before))&&(!after||!/[\p{L}\p{N}]/u.test(after)))return true;
  }
  return false;
 });
 if(named.length>1)return [];
 return plan.flatMap(t=>{
  if(t.kind!=="vet_brief"||t.pets.length!==1)return [];
  const matches=references.filter(r=>r.request.kind==="history"&&r.request.pet.handle===t.pets[0]&&(!named.length||r.request.pet.handle===named[0].handle)&&r.request.expectedSources.length===1&&!r.request.discoveryIncomplete);
  return matches.length===1?[{task:t.id,reference:matches[0].handle,petHandle:matches[0].request.pet.handle,pet:matches[0].request.pet.name}]:[];
 });
}
export function evidenceCompletionSchema(plan,sources,supplements=[]){
 const handles=reviewSources(plan,sources).map(s=>s.handle);
 return object({
  sourceReview:object(Object.fromEntries(handles.map(handle=>[handle,choice(["routine","noteworthy","uncertain","irrelevant"])]))),
  missingReference:{anyOf:[{type:"null"},...supplements.map(s=>object({task:choice([s.task]),reference:choice([s.reference]),requestExcerpt:{type:"string",minLength:10,maxLength:300}}))]}
 });
}
export function parseEvidenceCompletion(final,plan,sources,supplements,question){
 if(!Object.hasOwn(final??{},"evidenceCompletion"))return {value:final,review:[],supplement:null}; // Stored/local adapters.
 const review=final.evidenceCompletion,expected=reviewSources(plan,sources).map(s=>s.handle);
 if(!keys(review,["sourceReview","missingReference"]))reject("review_shape");
 // Required per-source keys encode exact coverage in the live schema. Legacy
 // partitions/adapters remain readable but never waive membership or uniqueness.
 const roles=["routine","noteworthy","uncertain","irrelevant"],raw=review.sourceReview;
 const keyed=keys(raw,expected)&&expected.every(source=>roles.includes(raw[source]));
 if(!keyed&&!Array.isArray(raw)&&(!keys(raw,roles)||roles.some(role=>!Array.isArray(raw[role])||raw[role].length>expected.length)))reject("review_shape");
 const entries=keyed?expected.map(source=>({source,classification:raw[source]})):Array.isArray(raw)?raw:roles.flatMap(classification=>raw[classification].map(source=>({source,classification})));
 if(entries.length!==expected.length)reject("review_shape");
 const ids=new Set();
 for(const r of entries){
  if(!keys(r,["source","classification"])||!expected.includes(r.source)||ids.has(r.source)||!["routine","noteworthy","uncertain","irrelevant"].includes(r.classification))reject("review_source");
  ids.add(r.source);
 }
 let supplement=null;
 if(review.missingReference!==null){
  const r=review.missingReference;
  if(!keys(r,["task","reference","requestExcerpt"])||typeof r.requestExcerpt!=="string"||r.requestExcerpt.trim().length<10||r.requestExcerpt.length>300||!question.includes(r.requestExcerpt))reject("supplement_request");
  const candidate=supplements.find(s=>s.task===r.task&&s.reference===r.reference);if(!candidate)reject("supplement_scope");
  supplement={...candidate,requestExcerpt:r.requestExcerpt};
 }
 const value={...final};delete value.evidenceCompletion;
 return {value,review:entries,supplement};
}

export function verifySingleReferenceResult(request,result,ownerId){
 if(request.kind!=="history"||!request.reference||request.expectedSources?.length!==1||!Array.isArray(result?.sources)||result.sources.length>1)reject("supplement_result");
 if(!result.sources.length)return;
 if(result.hasMore||result.truncated||result.unavailable||result.staleReference||result.scopeExhausted===false)reject("supplement_incomplete");
 const row=result.sources[0],expected=request.expectedSources[0];
 if(row.ownerId!==ownerId||row.petId!==request.pet.id||row.kind!=="history"||row.id!==expected.id||typeof row.body!=="string"
  ||createHash("sha256").update(row.body).digest("hex")!==expected.hash||!Number.isFinite(Date.parse(row.eventAt))||!Number.isFinite(Date.parse(row.recordedAt))
  ||Date.parse(row.eventAt)!==Date.parse(expected.eventAt)||Date.parse(row.recordedAt)!==Date.parse(expected.recordedAt))reject("supplement_changed_or_foreign");
}

export function supplementalTaskPlan(plan,supplement){
 return plan.map(t=>t.id===supplement.task?{...t,needsHistory:true,recordMode:"single",reference:supplement.reference,missing:t.missing.filter(k=>!["pet","year","date_meaning","which_record"].includes(k))}:t);
}
export function applyReferenceCompletion(value,plan,supplement,sources){
 const source=sources[0],available=source?.kind==="history"&&source.body.trim().length<=280;
 const tasks=supplementalTaskPlan(plan,supplement);
 const completion=value.completion.map(e=>e.task===supplement.task?{...e,sources:available?[source.handle]:[],historyFacts:available?[{source:source.handle,excerpt:source.body.trim()}]:[],...(!available?{status:"partial",reason:source?"not_answered":"source_unavailable"}:{})}:e);
 return {plan:tasks,value:{...value,sources:available?[...new Set([...value.sources,source.handle])]:value.sources,completion},available};
}
export function applySourceReview(value,plan,sources,review){
 let recovered=0,unrendered=0;
 const noteworthy=review.filter(r=>r.classification==="noteworthy");
 if(!review.length)return {value,recovered,unrendered,reviewed:0,noteworthy:0};
 const completion=value.completion.map(e=>{
  const task=plan.find(t=>t.id===e.task);if(!task||!collection(task))return e;
  // Reserve the SAME six slots for reviewed exceptions before routine detail.
  // Classification selects presentation only: full owned original bodies still
  // provide every word, and another task's source can never be borrowed.
  const priority=[];let missing=0;
  for(const r of noteworthy){
   if(!e.sources.includes(r.source))continue;
   const source=sources.find(s=>s.handle===r.source&&s.kind==="history"),body=source?.body.trim();
   if(!body||body.length>280){missing++;continue;}
   priority.push({source:r.source,excerpt:body});
  }
  const admitted=priority.slice(0,6);missing+=Math.max(0,priority.length-6);
  const ids=new Set(admitted.map(f=>f.source));
  for(const fact of admitted)if(e.historyFacts.find(f=>f.source===fact.source)?.excerpt!==fact.excerpt)recovered++;
  // Active collection overviews place routine evidence in the thematic synthesis;
  // exact original notes/timestamps remain available in Saved sources. Direct
  // single-note and vet-brief requests never enter this collection branch.
  const themes=Object.hasOwn(e,"historySynthesis")?validateHistorySynthesis(e.historySynthesis,sources,e.sources)??[]:[];
  const routine=new Set(review.filter(r=>r.classification==="routine").map(r=>r.source));
  const bareMeasurement=(sentence,source)=>{
   const name=String(source.petName??"").replace(/[.*+?^{}$()|[\]\\]/g,"\\$&");
   const values=readSourceMeasurements(sentence,source.handle,"history",source.petName).filter(m=>m.metric==="body_weight");
   return values.some(m=>{
    const literal=m.excerpt.replace(/[.*+?^{}$()|[\]\\]/g,"\\$&");
    return new RegExp("^(?:"+(name?name+"\\s+(?:weighed|weighs)|":"")+"(?:body\\s+)?weight)\\s*(?:(?:was|is|of|at)\\s*|:\\s*)?"+literal+"[.!]?\\s*$","i").test(sentence);
   });
  };
  const alreadyRepresented=f=>{
   const source=sources.find(s=>s.handle===f.source);
   if(!source||!routine.has(f.source)||typeof f.excerpt!=="string")return false;
   const quoted=themes.flatMap(t=>t.evidence).filter(p=>p.source===f.source).map(p=>p.excerpt);
   if(!quoted.length)return false;
   const sentences=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(f.excerpt)].map(p=>p.segment.trim()).filter(Boolean);
   return sentences.length>0&&sentences.every(sentence=>quoted.some(q=>q.includes(sentence))||bareMeasurement(sentence,source));
  };
  // Keep independently selected older context, even when review calls it
  // routine. Remove only wording already present in a verified thematic quote
  // plus a bare typed weight; never discard another observation or caveat.
  const remaining=e.historyFacts.filter(f=>!ids.has(f.source)&&!alreadyRepresented(f)).slice(0,6-admitted.length);
  const next={...e,historyFacts:[...admitted,...remaining]};
  if(missing){unrendered+=missing;next.status="partial";next.reason="not_answered";}
  if(Object.hasOwn(next,"historySynthesis"))next.historySynthesis=next.historySynthesis.map(t=>({...t,evidence:t.evidence.filter(p=>!ids.has(p.source))})).filter(t=>t.evidence.length);
  return next;
 });
 const auditedIds=new Set(noteworthy.map(r=>r.source));
 const selected=completion.flatMap(e=>e.historyFacts.filter(f=>auditedIds.has(f.source)).map(f=>f.source));
 return {value:{...value,sources:[...new Set([...value.sources,...selected])],completion},recovered,unrendered,reviewed:review.length,noteworthy:noteworthy.length};
}
