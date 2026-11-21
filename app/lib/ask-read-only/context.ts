import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
type DialogueRow={id:string;role:string;user_text:string|null;response_data:unknown};
/** Previous visible prose is conversation context, never fresh saved-source authority.
 * Copy only rendered text; citation proofs, capabilities and internal metadata stay out.
 * The core applies the shared text/window budget and reports any resulting clipping.
 */
function previousAssistantText(value:unknown):string {
 if(!value||typeof value!=="object"||Array.isArray(value))return "";
 const response=value as Record<string,unknown>;
 const main=typeof response.directAnswer==="string"&&response.directAnswer.length
  ?response.directAnswer:typeof response.summary==="string"?response.summary:"";
 const sections=Array.isArray(response.sections)?response.sections.flatMap(value=>{
  if(!value||typeof value!=="object"||Array.isArray(value))return [];
  const section=value as Record<string,unknown>;
  if(typeof section.heading!=="string"||!Array.isArray(section.items))return [];
  const items=section.items.filter((item):item is string=>typeof item==="string");
  return items.length?[section.heading+"\n"+items.map((item,index)=>String(index+1)+". "+item).join("\n")]:[];
 }):[];
 return [main,...sections].filter(text=>text.length>0).join("\n\n");
}
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
 // Persisted public replies use the canonical "furvise" role. Keep legacy
 // assistant rows readable; user/unknown rows cannot supply reference state.
 const latestAssistant=rows.find(row=>row.role==="furvise"||row.role==="assistant");
 const previous=rows.find(row=>(row.role==="furvise"||row.role==="assistant")&&row.response_data&&typeof row.response_data==="object"&&Object.hasOwn(row.response_data,"readOnlyReferences"));
 const readReferences=previous?(previous.response_data as Record<string,unknown>).readOnlyReferences:null;
 return {readReferences,referencesFromPreviousAnswer:previous?.id===latestAssistant?.id,dialogueMayBeIncomplete:rows.length>=13,pets:owned.map(p=>({id:p.id,ownerId:p.user_id,name:p.name,species:p.species})),dialogue:rows.filter(row=>row.id!==currentMessageId).reverse().map(row=>({
  role:row.role==="user"?"user":"assistant",text:row.role==="user"?row.user_text??"":previousAssistantText(row.response_data)
 }))};
}
