import type { DogProfileRow } from "../supabase.ts";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarBoundaryToInstant } from "../ask-time-zone.ts";
export type ReadPet = {id:string;ownerId:string;name:string;species:string|null;handle:string};
import { checkReferencedSources, validateContinuationAnchors } from "./references.mjs";
import { discoverHistory, discoverHistoryBatch, HISTORY_PAGE_BUDGET, HISTORY_CANDIDATE_BUDGET } from "./retrieval.mjs";
export type ReadRequest = {continuation?:{reference:string;range:{axis:"event"|"recorded";from:string;to:string};anchorRequest:ReadRequest};kind:"profile"|"history";pet:ReadPet;from?:string|null;to?:string|null;terms?:string[];offset?:number;order?:"asc"|"desc";goal?:string;recordedFrom?:string|null;recordedTo?:string|null;orderBy?:"event"|"recorded";pageBudget?:number;candidateBudget?:number;deadlineAt?:number;referenceTimeZone?:string;sourceIds?:string[];expectedSources?:Array<{id:string;hash:string;eventAt:string;recordedAt:string}>};
export type ReadSource = {kind:"profile"|"history";id:string;ownerId:string;petId:string;body:string;eventAt:string;recordedAt:string;handle?:string};
export const READ_ONLY_PROFILE_FIELDS="id,user_id,name,species,breed,age_value,age_unit,weight_value,weight_unit,current_food,main_concern,wellness_goal,avoid_ingredients,monthly_budget,sex,routine_note,lifecycle_status,lifecycle_changed_at,deceased_at,created_at,updated_at";
export function serializeReadOnlyProfile(row:DogProfileRow) {
 const record=row as unknown as Record<string,unknown>;
 return JSON.stringify(Object.fromEntries(READ_ONLY_PROFILE_FIELDS.split(",").filter(key=>!["id","user_id","created_at","updated_at"].includes(key)).map(key=>[key,record[key]??null])));
}
export function literalSearch(value:string){return "%"+value.replace(/[\\%_]/g,"\\$&")+"%";}
function nextDate(value:string){const d=new Date(value+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
/** A disjoint, null-safe complement of the lexical OR. Literal operands remain
 * quoted PostgREST values; neither lane can change owner/date predicates. */
export function historyTextFilter(terms:string[],excludeTerms:string[]=[]) {
 if(terms.length)return terms.flatMap(term=>["note","title"].map(column=>column+".ilike."+JSON.stringify(literalSearch(term)))).join(",");
 if(excludeTerms.length)return "and("+excludeTerms.flatMap(term=>["note","title"].map(column=>"or("+column+".is.null,"+column+".not.ilike."+JSON.stringify(literalSearch(term))+")")).join(",")+")";
 return null;
}
export function createReadOnlyDataAccess(db:SupabaseClient,ownerId:string,timeZone:string,access?:{from:string;to:string},onRead?:(value:Record<string,unknown>)=>void) {
 const authorize=async(request:ReadRequest)=>{
  if(request.pet.ownerId!==ownerId)throw new Error("ASK_READ_PET_NOT_AUTHORIZED");
  const {data:pet,error}=await db.from("dog_profiles").select(request.kind==="profile"?READ_ONLY_PROFILE_FIELDS:"id,user_id")
   .eq("user_id",ownerId).eq("id",request.pet.id).retry(false).abortSignal(AbortSignal.timeout(5000)).maybeSingle<DogProfileRow>();
  if(error||!pet||pet.user_id!==ownerId||pet.id!==request.pet.id)throw new Error("ASK_READ_PET_NOT_AUTHORIZED");
  return pet;
 };
 const fetchPage=async(request:ReadRequest,{terms,excludeTerms=[],offset,limit}:{terms:string[];excludeTerms?:string[];offset:number;limit:number})=>{
  const remaining=Math.min(5000,(request.deadlineAt??Date.now()+5000)-Date.now());
  if(remaining<=0)throw new Error("ASK_READ_HISTORY_UNAVAILABLE");
  let query=db.from("pet_care_entries").select("id,user_id,pet_profile_id,note,title,occurred_at,created_at,deleted_at",{count:"exact"})
   .eq("user_id",ownerId).eq("pet_profile_id",request.pet.id).is("deleted_at",null);
  if(request.sourceIds)query=query.in("id",request.sourceIds);
  if(access)query=query.gte("occurred_at",access.from).lt("occurred_at",access.to);
  for(const [column,from,to] of [["occurred_at",request.from,request.to],["created_at",request.recordedFrom,request.recordedTo]] as const){
   if(from)query=query.gte(column,calendarBoundaryToInstant(from+"T00:00:00.000Z",request.referenceTimeZone??timeZone));
   if(to)query=query.lt(column,calendarBoundaryToInstant(nextDate(to)+"T00:00:00.000Z",request.referenceTimeZone??timeZone));
  }
  const filter=historyTextFilter(terms,excludeTerms);
  if(filter)query=query.or(filter);
  const orderColumn=request.orderBy==="recorded"?"created_at":"occurred_at";
  const {data,error,count}=await query.order(orderColumn,{ascending:request.order==="asc"}).order("id",{ascending:true})
   .range(offset,offset+limit-1).retry(false).abortSignal(AbortSignal.timeout(remaining));
  if(error||!data)throw new Error("ASK_READ_HISTORY_UNAVAILABLE");
  if(data.some(row=>row.user_id!==ownerId||row.pet_profile_id!==request.pet.id||row.deleted_at))throw new Error("ASK_READ_SOURCE_NOT_AUTHORIZED");
  return {sources:data.map(row=>({kind:"history" as const,id:row.id,ownerId:row.user_id,petId:row.pet_profile_id,body:row.note??row.title??"",eventAt:row.occurred_at,recordedAt:row.created_at})),
   total:count,hasMore:typeof count==="number"?offset+data.length<count:data.length===limit};
 };
 const profile=(request:ReadRequest,pet:DogProfileRow)=>{
  const {id,user_id,created_at,updated_at}=pet;
  return checkReferencedSources({sources:[{kind:"profile",id,ownerId:user_id,petId:id,body:serializeReadOnlyProfile(pet),eventAt:updated_at,recordedAt:created_at}],total:1,hasMore:false,scopeExhausted:true},request);
 };
 const report=(request:ReadRequest,discovered:Awaited<ReturnType<typeof discoverHistory>> & {continuationValidation?:{valid:boolean;unavailable:boolean;attempts:number;pages:number;rows:number;reused:boolean}})=>{
  const result=checkReferencedSources(discovered,request);
  onRead?.({petHandle:request.pet.handle,goal:request.goal??"relevant_records",from:request.from??null,to:request.to??null,
   recordedFrom:request.recordedFrom??null,recordedTo:request.recordedTo??null,orderBy:request.orderBy??"event",termCount:request.terms?.length??0,
   referenceRead:!!request.sourceIds,offset:request.offset??0,order:request.order??"desc",matchedTotal:result.matchedTotal,returned:result.sources.length,
   inspected:result.inspected,sharedCollection:result.sharedCollection??false,sharedAcquisition:result.sharedAcquisition??false,discovery:result.discovery,batchAcquisition:result.batchAcquisition,hasMore:result.hasMore,searchRelaxed:result.searchRelaxed,scopeExhausted:result.scopeExhausted,unavailable:result.unavailable,continuationValidation:(result as typeof result & {continuationValidation?:unknown}).continuationValidation??null,timeZone});
  return result;
 };
 // Anchor checks and discovery share the same eight-attempt/64-row envelope.
 // They validate retained provenance; anchor text is never admitted as remainder.
 const execute=async(requests:ReadRequest[])=>{
  const pets=await Promise.all(requests.map(authorize));
  let attempts=0,pages=0,rawRows=0;
  const anchorRows=new Map<string,ReadSource>(),cache=new Map<string,{valid:boolean;unavailable:boolean;attempts:number;pages:number;rows:number}>();
  const validations=new Map<ReadRequest,{valid:boolean;unavailable:boolean;attempts:number;pages:number;rows:number;reused:boolean}>();
  for(const request of requests){
   if(!request.continuation)continue;
   const anchor=request.continuation.anchorRequest;
   const key=JSON.stringify([anchor.pet.id,anchor.from,anchor.to,anchor.recordedFrom,anchor.recordedTo,anchor.expectedSources]);
   const prior=cache.get(key);
   if(prior){validations.set(request,{...prior,attempts:0,pages:0,rows:0,reused:true});continue;}
   const count=anchor.expectedSources?.length??0;let valid=false,unavailable=true,rows=0,successPages=0;
   if(count>0&&count<=8&&attempts<HISTORY_PAGE_BUDGET&&rawRows+count<=HISTORY_CANDIDATE_BUDGET){
    attempts++;
    try{
     const result=await fetchPage({...anchor,deadlineAt:request.deadlineAt},{terms:[],offset:0,limit:count});
     pages++;successPages=1;unavailable=false;rows=result.sources.length;rawRows+=rows;
     for(const row of result.sources)anchorRows.set(row.kind+":"+row.id,row);
     valid=validateContinuationAnchors({...result,scopeExhausted:!result.hasMore},anchor);
    }catch{valid=false;}
   }
   const validation={valid,unavailable,attempts:count>0?1:0,pages:successPages,rows};cache.set(key,validation);validations.set(request,{...validation,reused:false});
  }
  const history=requests.filter(r=>r.kind==="history"&&(!r.continuation||validations.get(r)?.valid));
  const discovered=await discoverHistoryBatch(history,fetchPage,{pages:HISTORY_PAGE_BUDGET-attempts,rows:HISTORY_CANDIDATE_BUDGET-rawRows});
  const unique=new Set([...anchorRows.keys(),...discovered.flatMap(r=>r.sources.map((s:ReadSource)=>s.kind+":"+s.id))]);
  for(const result of discovered)if(result.batchAcquisition)Object.assign(result.batchAcquisition,{attempts:result.batchAcquisition.attempts+attempts,pages:result.batchAcquisition.pages+pages,rawRows:result.batchAcquisition.rawRows+rawRows,distinctCandidates:unique.size,validationAttempts:attempts,validationPages:pages,validationRows:rawRows,pageLimit:HISTORY_PAGE_BUDGET,rowLimit:HISTORY_CANDIDATE_BUDGET});
  let index=0;
  return requests.map((request,i)=>{
   if(request.kind==="profile")return profile(request,pets[i]);
   const validation=validations.get(request);
   if(validation&&!validation.valid)return report(request,{sources:[],total:null,hasMore:false,scopeExhausted:false,inspected:0,unavailable:validation.unavailable,staleReference:!validation.unavailable,continuationValidation:validation,batchAcquisition:{attempts,pages,rawRows,distinctCandidates:anchorRows.size,validationAttempts:attempts,validationPages:pages,validationRows:rawRows,pageLimit:HISTORY_PAGE_BUDGET,rowLimit:HISTORY_CANDIDATE_BUDGET}} as unknown as Awaited<ReturnType<typeof discoverHistory>>);
   const result=discovered[index++];
   return report(request,validation?{...result,continuationValidation:validation}:result);
  });
 };
 const read=async(request:ReadRequest)=>(await execute([request]))[0];
 read.batch=execute;
 return read;
}
