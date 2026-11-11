import type { DogProfileRow } from "../supabase.ts";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarBoundaryToInstant } from "../ask-time-zone.ts";
export type ReadPet = {id:string;ownerId:string;name:string;species:string|null;handle:string};
import { checkReferencedSources } from "./references.mjs";
import { discoverHistory } from "./retrieval.mjs";
export type ReadRequest = {kind:"profile"|"history";pet:ReadPet;from?:string|null;to?:string|null;terms?:string[];offset?:number;order?:"asc"|"desc";goal?:string;recordedFrom?:string|null;recordedTo?:string|null;orderBy?:"event"|"recorded";pageBudget?:number;candidateBudget?:number;deadlineAt?:number;referenceTimeZone?:string;sourceIds?:string[];expectedSources?:Array<{id:string;hash:string;eventAt:string;recordedAt:string}>};
export type ReadSource = {kind:"profile"|"history";id:string;ownerId:string;petId:string;body:string;eventAt:string;recordedAt:string;handle?:string};
export const READ_ONLY_PROFILE_FIELDS="id,user_id,name,species,breed,age_value,age_unit,weight_value,weight_unit,current_food,main_concern,wellness_goal,avoid_ingredients,monthly_budget,sex,routine_note,lifecycle_status,lifecycle_changed_at,deceased_at,created_at,updated_at";
export function serializeReadOnlyProfile(row:DogProfileRow) {
 const record=row as unknown as Record<string,unknown>;
 return JSON.stringify(Object.fromEntries(READ_ONLY_PROFILE_FIELDS.split(",").filter(key=>!["id","user_id","created_at","updated_at"].includes(key)).map(key=>[key,record[key]??null])));
}
export function literalSearch(value:string){return "%"+value.replace(/[\\%_]/g,"\\$&")+"%";}
function nextDate(value:string){const d=new Date(value+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export function createReadOnlyDataAccess(db:SupabaseClient,ownerId:string,timeZone:string,access?:{from:string;to:string},onRead?:(value:Record<string,unknown>)=>void) {
 return async(request:ReadRequest) => {
  if(request.pet.ownerId!==ownerId)throw new Error("ASK_READ_PET_NOT_AUTHORIZED");
  // RLS remains active. Every query also binds authenticated ownership explicitly.
  const {data:pet,error:petError}=await db.from("dog_profiles").select(request.kind==="profile"?READ_ONLY_PROFILE_FIELDS:"id,user_id")
   .eq("user_id",ownerId).eq("id",request.pet.id).retry(false).abortSignal(AbortSignal.timeout(5000)).maybeSingle<DogProfileRow>();
  if(petError||!pet||pet.user_id!==ownerId||pet.id!==request.pet.id)throw new Error("ASK_READ_PET_NOT_AUTHORIZED");
  if(request.kind==="profile") {
   const {id,user_id,created_at,updated_at}=pet;
   return checkReferencedSources({sources:[{kind:"profile",id,ownerId:user_id,petId:id,body:serializeReadOnlyProfile(pet),eventAt:updated_at,recordedAt:created_at}],total:1,hasMore:false,scopeExhausted:true},request);
  }
  const discovered=await discoverHistory(request,async({terms,offset,limit}:{terms:string[];offset:number;limit:number})=>{
   const remaining=Math.min(5000,(request.deadlineAt??Date.now()+5000)-Date.now());
   if(remaining<=0)throw new Error("ASK_READ_HISTORY_UNAVAILABLE");
   let query=db.from("pet_care_entries").select("id,user_id,pet_profile_id,note,title,occurred_at,created_at,deleted_at",{count:"exact"})
    .eq("user_id",ownerId).eq("pet_profile_id",request.pet.id).is("deleted_at",null);
   if(request.sourceIds)query=query.in("id",request.sourceIds);
   // Entitlement/access bounds always apply to event time, independently of the
   // user's additional recorded-time filters. Never relax owner or time bounds.
   if(access)query=query.gte("occurred_at",access.from).lt("occurred_at",access.to);
   for(const [column,from,to] of [["occurred_at",request.from,request.to],["created_at",request.recordedFrom,request.recordedTo]] as const){
    if(from)query=query.gte(column,calendarBoundaryToInstant(from+"T00:00:00.000Z",request.referenceTimeZone??timeZone));
    if(to)query=query.lt(column,calendarBoundaryToInstant(nextDate(to)+"T00:00:00.000Z",request.referenceTimeZone??timeZone));
   }
   // Quote PostgREST values as well as escaping LIKE wildcards. A model phrase
   // cannot introduce another filter, column or boolean expression.
   if(terms.length)query=query.or(terms.flatMap(term=>["note","title"].map(column=>column+".ilike."+JSON.stringify(literalSearch(term)))).join(","));
   const orderColumn=request.orderBy==="recorded"?"created_at":"occurred_at";
   const {data,error,count}=await query.order(orderColumn,{ascending:request.order==="asc"}).order("id",{ascending:true})
    .range(offset,offset+limit).retry(false).abortSignal(AbortSignal.timeout(remaining));
   if(error||!data)throw new Error("ASK_READ_HISTORY_UNAVAILABLE");
   if(data.some(row=>row.user_id!==ownerId||row.pet_profile_id!==request.pet.id||row.deleted_at))throw new Error("ASK_READ_SOURCE_NOT_AUTHORIZED");
   return {sources:data.slice(0,limit).map(row=>({kind:"history",id:row.id,ownerId:row.user_id,petId:row.pet_profile_id,
    body:row.note??row.title??"",eventAt:row.occurred_at,recordedAt:row.created_at})),total:count,hasMore:data.length>limit};
  });
  const result=checkReferencedSources(discovered,request);
  onRead?.({petHandle:request.pet.handle,goal:request.goal??"relevant_records",from:request.from??null,to:request.to??null,
   recordedFrom:request.recordedFrom??null,recordedTo:request.recordedTo??null,orderBy:request.orderBy??"event",termCount:request.terms?.length??0,
   referenceRead:!!request.sourceIds,offset:request.offset??0,order:request.order??"desc",matchedTotal:result.matchedTotal,returned:result.sources.length,
   inspected:result.inspected,discovery:result.discovery,hasMore:result.hasMore,searchRelaxed:result.searchRelaxed,scopeExhausted:result.scopeExhausted,unavailable:result.unavailable,timeZone});
  return result;
 };
}
