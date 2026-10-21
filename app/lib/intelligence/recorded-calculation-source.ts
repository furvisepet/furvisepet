import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareEntryRow } from "../supabase.ts";
import type { RecordedCalculationContext } from "../furvise-brain/muscle.ts";
import { getActiveAiAdmission } from "../ai/usage-guard/context.ts";
import { withExecutionDeadline } from "../ai/execution-deadline.ts";

export function createRecordedCalculationContext(input:{
 supabase:SupabaseClient;requestId:string;ownerId:string;petIds:readonly string[];signal?:AbortSignal;
}):RecordedCalculationContext {
 const admission=getActiveAiAdmission(),scope={userId:input.ownerId,ownedPetIds:[...input.petIds]};
 if(!admission||admission.feature!=="ask"||!admission.deadline)throw Error("RECORDED_ADMISSION_REQUIRED");
 const deadline=admission.deadline;
 const assertCurrent=()=>{
  if(getActiveAiAdmission()!==admission||input.signal?.aborted)throw Error("RECORDED_REQUEST_CANCELLED");
  deadline.allocate("evidence_retrieval",3000,4000);
 };
 assertCurrent();
 return {requestId:input.requestId,scope,assertCurrent,
  async readSource(ref){
   assertCurrent();
   if(ref.ownerId!==scope.userId||!scope.ownedPetIds.includes(ref.subjectId))throw Error("RECORDED_SOURCE_SCOPE");
   const timeout=deadline.allocate("evidence_retrieval",3000,4000);
   const data=await withExecutionDeadline(async localSignal=>{
    const signal=input.signal?AbortSignal.any([localSignal,input.signal]):localSignal;
    const query=input.supabase.from("pet_care_entries").select("*")
      .eq("id",ref.recordId).eq("user_id",ref.ownerId).eq("pet_profile_id",ref.subjectId).limit(2).abortSignal(signal);
    let rejectAbort:(reason:unknown)=>void=()=>{};
    const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
    const onAbort=()=>rejectAbort(signal.reason??Error("RECORDED_REQUEST_CANCELLED"));
    signal.addEventListener("abort",onAbort,{once:true});
    try{
     if(signal.aborted)onAbort();
     const result=await Promise.race([Promise.resolve(query),aborted]);
     assertCurrent();
     if(result.error||!Array.isArray(result.data)||result.data.length>1)throw Error("RECORDED_SOURCE_UNAVAILABLE");
     return result.data.length?result.data[0] as CareEntryRow:null;
    }finally{signal.removeEventListener("abort",onAbort);}
   },timeout);
   assertCurrent();return data;
  }};
}
