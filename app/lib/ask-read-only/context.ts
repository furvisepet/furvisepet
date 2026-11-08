import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
type DialogueRow={id:string;role:string;user_text:string|null;response_data:{directAnswer?:unknown}|null};
export async function loadReadOnlyContext(db:SupabaseClient,ownerId:string,petId:string,conversationId:string,currentMessageId:string,question:string) {
 const [pets,conversation,messages]=await Promise.all([
  db.from("dog_profiles").select("id,user_id,name,species").eq("user_id",ownerId).order("id").limit(65).abortSignal(AbortSignal.timeout(5000)),
  db.from("ask_conversations").select("id").eq("user_id",ownerId).eq("id",conversationId).eq("pet_profile_id",petId).abortSignal(AbortSignal.timeout(5000)).maybeSingle(),
  db.from("ask_conversation_messages").select("id,role,user_text,response_data").eq("user_id",ownerId).eq("conversation_id",conversationId)
   .order("sequence_number",{ascending:false}).limit(13).abortSignal(AbortSignal.timeout(5000))
 ]);
 if(pets.error||conversation.error||messages.error||!conversation.data||!pets.data||pets.data.length>64)throw new Error("ASK_READ_CONTEXT_UNAVAILABLE");
 const owned=pets.data.filter(p=>p.user_id===ownerId);
 if(owned.length!==pets.data.length||!owned.some(p=>p.id===petId))throw new Error("ASK_READ_PET_NOT_AUTHORIZED");
 const rows=messages.data as DialogueRow[];
 if(!rows.some(row=>row.id===currentMessageId&&row.role==="user"&&row.user_text===question))throw new Error("ASK_READ_SOURCE_NOT_AUTHORIZED");
 return {pets:owned.map(p=>({id:p.id,ownerId:p.user_id,name:p.name,species:p.species})),dialogue:rows.filter(row=>row.id!==currentMessageId).reverse().map(row=>({
  role:row.role==="user"?"user":"assistant",text:row.role==="user"?row.user_text??"":typeof row.response_data?.directAnswer==="string"?row.response_data.directAnswer:""
 }))};
}
