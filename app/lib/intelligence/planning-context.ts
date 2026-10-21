import type { SupabaseClient } from "@supabase/supabase-js";
import type { DogProfileRow } from "../supabase.ts";
import type { FurviseLiveContext } from "./types.ts";
import { FurviseContextError } from "./retrieve-context.ts";
import { ownerNoteSourceSpans } from "./owner-note-request.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";

/** Initial planning acquires identity/USER metadata plus owned citation identities, never assistant factual premises. */
export async function buildFurvisePlanningContext(input: {
  supabase: SupabaseClient; userId: string; petId: string; conversationId: string; currentMessage: string;
  sourceMessageId: string; locale: string; timeZone?: string;
}): Promise<FurviseLiveContext> {
  const { supabase, userId, petId, conversationId } = input;
  const [pets, conversation, messages] = await Promise.all([
    supabase.from("dog_profiles").select("id,user_id,name,species,sex").eq("user_id", userId),
    supabase.from("ask_conversations").select("id").eq("id", conversationId).eq("user_id", userId).eq("pet_profile_id", petId).maybeSingle(),
    supabase.from("ask_conversation_messages").select("id,request_id,role,user_text,created_at,sequence_number").eq("conversation_id", conversationId).eq("user_id", userId).eq("role", "user")
      .order("sequence_number", { ascending: false }).limit(40),
  ]);
  if (pets.error || conversation.error || messages.error || !conversation.data) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not verify the conversation.");
  const eligiblePets = (pets.data || []) as DogProfileRow[];
  const pet = eligiblePets.find(row => row.id === petId && row.user_id === userId);
  if (!pet) throw new FurviseContextError("PET_NOT_FOUND", "That pet is not available.");
  type UserRow = {id:string;request_id?:string|null;role:string;user_text:string;created_at:string;sequence_number?:number|null};
  type CitationRow = {id:string;request_id:string|null;role:string;response_data:unknown;created_at:string;sequence_number:number};
  const users = ((messages.data || []) as UserRow[]).filter(row=>row.role==="user").reverse();
  if(users.some(row=>typeof row.user_text!=="string"))throw new FurviseContextError("CONTEXT_UNAVAILABLE","The request sources could not be verified.");
  const current = users.find(row=>row.id===input.sourceMessageId);
  if(!current || current.user_text!==input.currentMessage)throw new FurviseContextError("CONTEXT_UNAVAILABLE","The request source could not be verified.");
  const sequence = (n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
  const prior = sequence(current.sequence_number) ? users.filter(row=>sequence(row.sequence_number)&&row.sequence_number!<current.sequence_number!) : [];
  const requests = [...new Set(prior.flatMap(row=>typeof row.request_id==="string"?[row.request_id]:[]))];
  let citationRows:CitationRow[]=[];
  if(requests.length){
    const citations = await supabase.from("ask_conversation_messages").select("id,request_id,role,response_data,created_at,sequence_number")
      .eq("conversation_id",conversationId).eq("user_id",userId).eq("role","furvise").in("request_id",requests)
      .lt("sequence_number",current.sequence_number!).order("sequence_number",{ascending:false}).limit(40);
    if(citations.error)throw new FurviseContextError("CONTEXT_UNAVAILABLE","Conversation references could not be verified.");
    citationRows=(citations.data||[]) as CitationRow[];
  }
  // Both sides must belong to this owned read and the same unique logical request.
  // Project ONLY explicit citation identities. Assistant values/claims/receipts grant no authority.
  const conversationTurns:FurviseLiveContext["conversationTurns"]=[];
  // Retention is not resolution. Carry exact owned USER provenance, never an
  // assistant claim or the selected UI pet. Original scope/Binder guards decide.
  const subjectUserSources = new Map<string,string>();
  for (const user of prior) for (const named of explicitlyNamedOwnedPets(user.user_text, eligiblePets.filter(p=>p.user_id===userId)))
    subjectUserSources.set(named.id,user.id);
  const citedUserSources = new Map<string,string>();
  for(const user of users){
    conversationTurns.push({id:user.id,role:"user",text:user.user_text,createdAt:user.created_at});
    if(!user.request_id||!sequence(user.sequence_number)||!prior.includes(user))continue;
    if(users.filter(row=>row.request_id===user.request_id).length!==1)continue;
    const replies=citationRows.filter(row=>row.role==="furvise"&&row.request_id===user.request_id);
    if(replies.length!==1)continue;
    const reply=replies[0];
    if(!sequence(reply.sequence_number)||reply.sequence_number<=user.sequence_number)continue;
    const preceding=users.filter(row=>sequence(row.sequence_number)&&row.sequence_number!<reply.sequence_number)
      .sort((a,b)=>b.sequence_number!-a.sequence_number!)[0];
    if(preceding?.id!==user.id)continue;
    const response=reply.response_data;
    const summary=response&&typeof response==="object"&&!Array.isArray(response)?(response as Record<string,unknown>).summary:null;
    if(typeof summary!=="string")continue;
    const ids=[...new Set([...summary.matchAll(/\[(care:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi)].map(match=>match[1].toLowerCase()))];
    if(ids.length>64)throw new FurviseContextError("CONTEXT_UNAVAILABLE","Conversation references exceed the supported bound.");
    for (const sourceId of ids) citedUserSources.set(sourceId,user.id);
    if(ids.length)conversationTurns.push({id:reply.id,role:"furvise",text:ids.map(id=>"["+id+"]").join(" "),createdAt:reply.created_at});
  }
  const currentTurn = conversationTurns.find(turn => turn.id === input.sourceMessageId);
  if (!currentTurn || currentTurn.text !== input.currentMessage) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "The request source could not be verified.");
  return { feature: "ask", locale: input.locale, timeZone: input.timeZone, currentMessage: input.currentMessage, currentTimestamp: new Date().toISOString(),
    conversationId, pet, eligiblePets, owner: { userId, profile: null }, currentTurn, conversationTurns,
    ownerNoteSpans: ownerNoteSourceSpans(input.currentMessage, input.sourceMessageId),
    // askSourceWindows enforces the unchanged eight-turn/complete-source budget.
    pinnedUserSourceIds: [...new Set([...subjectUserSources.values(),...citedUserSources.values()])],
    careEntries: [], selectedCareEntries: [], activeConcerns: [],
    recentlyResolvedConcerns: [], activeEpisodes: [], monitoringEpisodes: [],
    recentlyResolvedEpisodes: [], currentState: null, legacyPetMemories: [], memories: [], productFeedback: [], contextRecovery: { unavailableSources: [] } };
}
