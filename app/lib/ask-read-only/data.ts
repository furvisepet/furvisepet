import type { DogProfileRow } from "../supabase.ts";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarBoundaryToInstant } from "../ask-time-zone.ts";
export type ReadPet = {id:string;ownerId:string;name:string;species:string|null;handle:string};
export type ReadRequest = {kind:"profile"|"history";pet:ReadPet;from?:string|null;to?:string|null;terms?:string[];offset?:number;order?:"asc"|"desc"};
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
   .eq("user_id",ownerId).eq("id",request.pet.id).abortSignal(AbortSignal.timeout(5000)).maybeSingle<DogProfileRow>();
  if(petError||!pet||pet.user_id!==ownerId||pet.id!==request.pet.id)throw new Error("ASK_READ_PET_NOT_AUTHORIZED");
  if(request.kind==="profile") {
   const {id,user_id,created_at,updated_at}=pet;
   return {sources:[{kind:"profile",id,ownerId:user_id,petId:id,body:serializeReadOnlyProfile(pet),eventAt:updated_at,recordedAt:created_at}],total:1,hasMore:false};
  }
  const search=async(terms:string[])=>{
   let query=db.from("pet_care_entries").select("id,user_id,pet_profile_id,note,title,occurred_at,created_at,deleted_at",{count:"exact"})
    .eq("user_id",ownerId).eq("pet_profile_id",request.pet.id).is("deleted_at",null);
   if(access)query=query.gte("occurred_at",access.from).lt("occurred_at",access.to);
   if(request.from)query=query.gte("occurred_at",calendarBoundaryToInstant(request.from+"T00:00:00.000Z",timeZone));
   if(request.to)query=query.lt("occurred_at",calendarBoundaryToInstant(nextDate(request.to)+"T00:00:00.000Z",timeZone));
   for(const term of terms)query=query.ilike("note",literalSearch(term));
   const offset=request.offset??0;
   return await query.order("occurred_at",{ascending:request.order==="asc"}).order("id",{ascending:true})
    .range(offset,offset+16).abortSignal(AbortSignal.timeout(5000));
  };
  let result=await search(request.terms??[]);
  if(result.error||!result.data)throw new Error("ASK_READ_HISTORY_UNAVAILABLE");
  const matchedTotal=result.count;
  // Lexical hints are not proof of absence. A bounded same-pet/date candidate
  // read can recover synonyms and over-specific model terms without another AI call.
  const searchRelaxed=result.data.length===0&&!!request.terms?.length
   &&(result.count===0||(result.count==null&&(request.offset??0)===0));
  if(searchRelaxed)result=await search([]);
  const {data,error,count}=result;
  if(error||!data)throw new Error("ASK_READ_HISTORY_UNAVAILABLE");
  if(data.some(row=>row.user_id!==ownerId||row.pet_profile_id!==request.pet.id||row.deleted_at))throw new Error("ASK_READ_SOURCE_NOT_AUTHORIZED");
  onRead?.({petHandle:request.pet.handle,from:request.from??null,to:request.to??null,termCount:request.terms?.length??0,offset:request.offset??0,order:request.order??"desc",matchedTotal,
   returned:data.slice(0,16).length,hasMore:data.length>16,searchRelaxed,timeZone});
  return {sources:data.slice(0,16).map(row=>({kind:"history",id:row.id,ownerId:row.user_id,petId:row.pet_profile_id,
   body:row.note??row.title??"",eventAt:row.occurred_at,recordedAt:row.created_at})),total:count,hasMore:data.length>16,matchedTotal,searchRelaxed};
 };
}
